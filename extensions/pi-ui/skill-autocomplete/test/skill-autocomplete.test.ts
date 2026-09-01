import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import skillAutocompleteExtension, {
  createSkillAutocompleteProvider,
  listSkillChoices,
  planInlineSkillInvocation,
  readSkillInvocationMode,
  type SkillChoice,
} from "../index.ts";

function skillCommand(name: string, path = `/skills/${name}/SKILL.md`): SlashCommandInfo {
  return {
    name: `skill:${name}`,
    description: `${name} description`,
    source: "skill",
    sourceInfo: {
      path,
      source: "local",
      scope: "user",
      origin: "top-level",
      baseDir: `/skills/${name}`,
    },
  };
}

const modelSkill: SkillChoice = {
  name: "go-development",
  description: "Develop Go code",
  path: "/skills/go-development/SKILL.md",
  invocationMode: "model",
};

const userSkill: SkillChoice = {
  name: "commit",
  description: "Create a commit",
  path: "/skills/commit/SKILL.md",
  invocationMode: "user",
};

test("reads Pi's disable-model-invocation frontmatter consistently", () => {
  assert.equal(
    readSkillInvocationMode("skill", () =>
      [
        "---",
        "name: commit",
        "description: Create a commit",
        "disable-model-invocation: true",
        "---",
        "Instructions",
      ].join("\n"),
    ),
    "user",
  );

  assert.equal(
    readSkillInvocationMode("skill", () =>
      [
        "---",
        "name: commit",
        "description: Create a commit",
        "disable-model-invocation: false",
        "---",
      ].join("\n"),
    ),
    "model",
  );

  assert.equal(
    readSkillInvocationMode("skill", () => {
      throw new Error("unreadable");
    }),
    "unknown",
  );
});

test("lists only skill commands and classifies each skill from its source file", () => {
  const commands: SlashCommandInfo[] = [
    skillCommand("model-skill"),
    skillCommand("user-skill"),
    {
      ...skillCommand("not-a-skill"),
      name: "prompt-name",
      source: "prompt",
    },
  ];

  const choices = listSkillChoices(commands, (path) =>
    path.includes("user-skill")
      ? "---\ndisable-model-invocation: true\n---\n"
      : "---\ndescription: visible\n---\n",
  );

  assert.deepEqual(
    choices.map(({ name, invocationMode }) => ({ name, invocationMode })),
    [
      { name: "model-skill", invocationMode: "model" },
      { name: "user-skill", invocationMode: "user" },
    ],
  );
});

test("autocomplete inserts exact inline skill names and labels user-only skills", async () => {
  const delegated: string[] = [];
  const current: AutocompleteProvider = {
    async getSuggestions() {
      delegated.push("suggestions");
      return null;
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      const line = lines[cursorLine] ?? "";
      const start = cursorCol - prefix.length;
      const newLines = [...lines];
      newLines[cursorLine] = line.slice(0, start) + item.value + line.slice(cursorCol);
      return { lines: newLines, cursorLine, cursorCol: start + item.value.length };
    },
  };
  const provider = createSkillAutocompleteProvider(current, () => [modelSkill, userSkill]);
  const signal = new AbortController().signal;

  const suggestions = await provider.getSuggestions(["please use $com"], 0, 15, { signal });
  assert.deepEqual(suggestions, {
    prefix: "$com",
    items: [
      {
        value: "$commit",
        label: "$commit",
        description: "explicit invocation · Create a commit",
      },
    ],
  });

  const completion = provider.applyCompletion(
    ["please use $com here"],
    0,
    15,
    suggestions!.items[0]!,
    "$com",
  );
  assert.deepEqual(completion, {
    lines: ["please use $commit here"],
    cursorLine: 0,
    cursorCol: 18,
  });

  assert.equal(await provider.getSuggestions(["price$com"], 0, 9, { signal }), null);
  assert.deepEqual(delegated, ["suggestions"]);
});

test("leaves model-invocable skill mentions as ordinary prompt text", () => {
  assert.deepEqual(
    planInlineSkillInvocation("Use $go-development for this change", [modelSkill, userSkill]),
    { action: "continue" },
  );
});

test("moves one user-only skill to Pi's required leading command", () => {
  assert.deepEqual(
    planInlineSkillInvocation("Please use $commit for these changes.", [modelSkill, userSkill]),
    {
      action: "transform",
      text: "/skill:commit Please use $commit for these changes.",
      skillName: "commit",
    },
  );

  assert.deepEqual(
    planInlineSkillInvocation("Use $commit, then describe the commit.", [userSkill]),
    {
      action: "transform",
      text: "/skill:commit Use $commit, then describe the commit.",
      skillName: "commit",
    },
  );
});

test("rejects multiple distinct user-only skills but permits repeated references to one", () => {
  const reviewSkill: SkillChoice = {
    name: "private-review",
    path: "/skills/private-review/SKILL.md",
    invocationMode: "user",
  };

  assert.deepEqual(
    planInlineSkillInvocation("Use $commit and $private-review", [userSkill, reviewSkill]),
    { action: "reject", skillNames: ["commit", "private-review"] },
  );
  assert.equal(
    planInlineSkillInvocation("Use $commit and then $commit again", [userSkill]).action,
    "transform",
  );
});

test("the module installs TUI autocomplete and restores rejected input", async () => {
  const handlers = new Map<string, (event: any, ctx: any) => any>();
  const commands = [skillCommand("commit"), skillCommand("private-review")];
  const pi = {
    on(name: string, handler: (event: any, ctx: any) => any) {
      handlers.set(name, handler);
    },
    getCommands() {
      return commands;
    },
  } as unknown as ExtensionAPI;

  skillAutocompleteExtension(pi, {
    readSkillFile: () => "---\ndisable-model-invocation: true\n---\n",
  });

  let providerFactory: ((current: AutocompleteProvider) => AutocompleteProvider) | undefined;
  handlers.get("session_start")!(
    {},
    {
      mode: "tui",
      ui: {
        addAutocompleteProvider(factory: typeof providerFactory) {
          providerFactory = factory;
        },
      },
    },
  );
  assert.ok(providerFactory);

  const notifications: Array<{ message: string; level: string }> = [];
  const restored: string[] = [];
  const input = handlers.get("input")!;
  const text = "Use $commit and $private-review";
  const result = await input(
    { source: "interactive", text },
    {
      mode: "tui",
      ui: {
        setEditorText(value: string) {
          restored.push(value);
        },
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
      },
    },
  );

  assert.deepEqual(result, { action: "handled" });
  assert.deepEqual(restored, [text]);
  assert.deepEqual(notifications, [
    {
      message:
        "Pi can explicitly invoke only one user-only skill per prompt: commit, private-review",
      level: "warning",
    },
  ]);
});
