import { readFileSync } from "node:fs";
import {
  parseFrontmatter,
  type ExtensionAPI,
  type SlashCommandInfo,
} from "@earendil-works/pi-coding-agent";
import {
  fuzzyFilter,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

const SKILL_COMMAND_PREFIX = "skill:";
const MAX_SUGGESTIONS = 20;
const INLINE_SKILL_PATTERN = /(^|[\s([{,;:])\$([a-z0-9-]+)(?=$|[\s)\]},.;:!?])/g;

export type SkillInvocationMode = "model" | "user" | "unknown";

export type SkillChoice = {
  name: string;
  description?: string;
  path: string;
  invocationMode: SkillInvocationMode;
};

export type InlineSkillPlan =
  | { action: "continue" }
  | { action: "transform"; text: string; skillName: string }
  | { action: "reject"; skillNames: string[] };

type SkillFrontmatter = {
  "disable-model-invocation"?: unknown;
};

type ReadSkillFile = (path: string) => string;

export function readSkillInvocationMode(
  path: string,
  readSkillFile: ReadSkillFile = (skillPath) => readFileSync(skillPath, "utf8"),
): SkillInvocationMode {
  try {
    const { frontmatter } = parseFrontmatter<SkillFrontmatter>(readSkillFile(path));
    return frontmatter["disable-model-invocation"] === true ? "user" : "model";
  } catch {
    return "unknown";
  }
}

export function listSkillChoices(
  commands: SlashCommandInfo[],
  readSkillFile?: ReadSkillFile,
): SkillChoice[] {
  return commands.flatMap((command) => {
    if (command.source !== "skill" || !command.name.startsWith(SKILL_COMMAND_PREFIX)) return [];

    const name = command.name.slice(SKILL_COMMAND_PREFIX.length);
    if (!name) return [];

    return [{
      name,
      description: command.description,
      path: command.sourceInfo.path,
      invocationMode: readSkillInvocationMode(command.sourceInfo.path, readSkillFile),
    }];
  });
}

function describeSkill(skill: SkillChoice): string | undefined {
  const prefix = skill.invocationMode === "user"
    ? "explicit invocation"
    : skill.invocationMode === "unknown"
      ? "invocation mode unknown"
      : undefined;

  if (!prefix) return skill.description;
  return skill.description ? `${prefix} · ${skill.description}` : prefix;
}

function extractSkillQuery(textBeforeCursor: string): string | undefined {
  const match = textBeforeCursor.match(/(?:^|[\s([{,;:])\$([a-z0-9-]*)$/);
  return match?.[1];
}

export function createSkillAutocompleteProvider(
  current: AutocompleteProvider,
  getSkills: () => SkillChoice[],
): AutocompleteProvider {
  return {
    triggerCharacters: ["$"],

    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      if (options.signal.aborted) return null;

      const currentLine = lines[cursorLine] ?? "";
      const query = extractSkillQuery(currentLine.slice(0, cursorCol));
      if (query === undefined) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const matches = fuzzyFilter(getSkills(), query, (skill) => skill.name).slice(0, MAX_SUGGESTIONS);
      if (matches.length === 0) {
        return current.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      return {
        prefix: `$${query}`,
        items: matches.map((skill) => ({
          value: `$${skill.name}`,
          label: `$${skill.name}`,
          description: describeSkill(skill),
        })),
      };
    },

    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },

    shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
      return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },
  };
}

export function planInlineSkillInvocation(text: string, skills: SkillChoice[]): InlineSkillPlan {
  const skillsByName = new Map(skills.map((skill) => [skill.name, skill]));
  const userOnlyNames: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(INLINE_SKILL_PATTERN)) {
    const name = match[2]!;
    const skill = skillsByName.get(name);
    if (skill?.invocationMode !== "user" || seen.has(name)) continue;
    seen.add(name);
    userOnlyNames.push(name);
  }

  if (userOnlyNames.length === 0) return { action: "continue" };
  if (userOnlyNames.length > 1) return { action: "reject", skillNames: userOnlyNames };

  const skillName = userOnlyNames[0]!;
  return {
    action: "transform",
    text: `/skill:${skillName} ${text}`,
    skillName,
  };
}

export default function skillAutocompleteExtension(
  pi: ExtensionAPI,
  dependencies: { readSkillFile?: ReadSkillFile } = {},
) {
  const invocationModes = new Map<string, SkillInvocationMode>();

  const getSkills = (): SkillChoice[] => {
    const commands = pi.getCommands();
    return commands.flatMap((command) => {
      if (command.source !== "skill" || !command.name.startsWith(SKILL_COMMAND_PREFIX)) return [];

      const name = command.name.slice(SKILL_COMMAND_PREFIX.length);
      if (!name) return [];

      let invocationMode = invocationModes.get(command.sourceInfo.path);
      if (!invocationMode) {
        invocationMode = readSkillInvocationMode(command.sourceInfo.path, dependencies.readSkillFile);
        invocationModes.set(command.sourceInfo.path, invocationMode);
      }

      return [{
        name,
        description: command.description,
        path: command.sourceInfo.path,
        invocationMode,
      }];
    });
  };

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.addAutocompleteProvider((current) => createSkillAutocompleteProvider(current, getSkills));
  });

  pi.on("input", (event, ctx) => {
    if (event.source !== "interactive") return { action: "continue" };

    const plan = planInlineSkillInvocation(event.text, getSkills());
    if (plan.action === "continue") return { action: "continue" };
    if (plan.action === "transform") return { action: "transform", text: plan.text };

    if (ctx.mode === "tui") {
      ctx.ui.setEditorText(event.text);
      ctx.ui.notify(
        `Pi can explicitly invoke only one user-only skill per prompt: ${plan.skillNames.join(", ")}`,
        "warning",
      );
    }
    return { action: "handled" };
  });
}
