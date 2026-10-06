import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import toolCardsExtension from "../index.ts";
import {
  CompactToolCard,
  describeToolCall,
  EmptyToolResult,
  hasExpandableResult,
  highlightShellCommand,
  highlightShellCommandLines,
  inferHeredocLanguage,
  previewToolResult,
  summarizeToolResult,
  type CompactTheme,
} from "../rendering.ts";

const plainTheme: CompactTheme = {
  fg: (_color, text) => text,
};

test("describes built-in calls without their full arguments", () => {
  assert.equal(describeToolCall("bash", { command: "mise run build" }, "/repo"), "mise run build");
  assert.equal(
    describeToolCall("read", { path: "/repo/src/index.ts", offset: 10, limit: 5 }, "/repo"),
    "Path: src/index.ts:10-14",
  );
  assert.equal(
    describeToolCall("edit", { path: "src/index.ts", edits: [{}, {}] }, "/repo"),
    "Path: src/index.ts · 2 changes",
  );
  assert.equal(
    describeToolCall("grep", { pattern: "renderCall", path: "extensions" }, "/repo"),
    "Query: /renderCall/ in extensions",
  );
  assert.equal(
    describeToolCall("write", { path: "README.md", content: "one line" }, "/repo"),
    "Path: README.md · 1 line",
  );
});

test("summarizes built-in tool results", () => {
  assert.equal(
    summarizeToolResult("bash", { content: [{ type: "text", text: "one" }] }),
    undefined,
  );
  assert.equal(
    summarizeToolResult(
      "bash",
      { content: [{ type: "text", text: "(no output)\n\nCommand exited with code 7" }] },
      true,
    ),
    "exit code: 7",
  );
  assert.equal(
    summarizeToolResult("read", { content: [{ type: "text", text: "one\ntwo\nthree" }] }),
    "3 lines",
  );
  assert.equal(
    summarizeToolResult("find", { content: [{ type: "text", text: "a.ts\nb.ts" }] }),
    "2 files",
  );
  assert.equal(
    summarizeToolResult("grep", { content: [{ type: "text", text: "match\ncontext" }] }),
    "2 results",
  );
  assert.equal(
    summarizeToolResult("edit", {
      content: [{ type: "text", text: "done" }],
      details: { diff: "--- a\n+++ b\n-old\n+new\n+more" },
    }),
    "+2 -1",
  );
});

test("shows disclosure only for useful expandable output", () => {
  assert.equal(
    hasExpandableResult("bash", { content: [{ type: "text", text: "(no output)" }] }),
    false,
  );
  assert.equal(
    hasExpandableResult("bash", { content: [{ type: "text", text: "compiler output" }] }),
    true,
  );
  assert.equal(
    hasExpandableResult("bash", {
      content: [{ type: "text", text: "(no output)\n\nCommand exited with code 1" }],
    }),
    false,
  );
  assert.equal(
    hasExpandableResult("write", { content: [{ type: "text", text: "Permission denied" }] }, true),
    true,
  );
});

test("colors shell commands by token role", () => {
  const themed: CompactTheme = {
    fg: (color, text) => `<${color}>${text}</${color}>`,
  };
  const rendered = highlightShellCommand(
    `git log --format='%h %s' && cat "$HOME/file" # note`,
    themed,
  );
  assert.match(rendered, /<syntaxFunction>git<\/syntaxFunction>/u);
  assert.match(rendered, /<syntaxKeyword>--format=/u);
  assert.match(rendered, /<syntaxOperator>&&<\/syntaxOperator>/u);
  assert.match(rendered, /<syntaxVariable>"\$HOME\/file"<\/syntaxVariable>/u);
  assert.match(rendered, /<syntaxComment># note<\/syntaxComment>/u);
});

test("infers heredoc languages from destinations, consumers, and content arguments", () => {
  assert.equal(inferHeredocLanguage("cat > script.py <<'EOF'", "EOF"), "python");
  assert.equal(inferHeredocLanguage(`cat <<'EOF' > "$run_dir/script.py"`, "EOF"), "python");
  assert.equal(inferHeredocLanguage("python3 - <<'EOF'", "EOF"), "python");
  assert.equal(inferHeredocLanguage("cat <<'MARKDOWN'", "MARKDOWN"), "markdown");
  assert.equal(inferHeredocLanguage("gh pr create --body-file - <<'EOF'", "EOF"), "markdown");
  assert.equal(inferHeredocLanguage("git commit -F - <<'EOF'", "EOF"), undefined);
  assert.equal(inferHeredocLanguage("cat <<'EOF'", "EOF"), undefined);
});

test("highlights complete heredoc bodies in their inferred language", () => {
  const themed: CompactTheme = {
    fg: (color, text) => `<${color}>${text}</${color}>`,
  };
  const highlighted: Array<[string, string | undefined]> = [];
  const rendered = highlightShellCommandLines(
    "cat > script.py <<'EOF'\nprint(\"hello\")\n# still Python\nEOF\necho done",
    themed,
    (code, language) => {
      highlighted.push([code, language]);
      return code.split("\n").map((line) => `<${language}>${line}</${language}>`);
    },
  );

  assert.deepEqual(highlighted, [[`print("hello")\n# still Python`, "python"]]);
  assert.match(rendered[0] ?? "", /<syntaxFunction>cat<\/syntaxFunction>/u);
  assert.equal(rendered[1], `<python>print("hello")</python>`);
  assert.equal(rendered[2], "<python># still Python</python>");
  assert.equal(rendered[3], "<syntaxOperator>EOF</syntaxOperator>");
  assert.match(rendered[4] ?? "", /<syntaxFunction>echo<\/syntaxFunction>/u);
});

test("highlights multi-line shell commands as complete Bash scripts", () => {
  const script = "set -eu\nfor file in *.json; do\n  printf '%s\\n' \"$file\"\ndone";
  const highlighted: Array<[string, string | undefined]> = [];
  const rendered = highlightShellCommandLines(script, plainTheme, (code, language) => {
    highlighted.push([code, language]);
    return code.split("\n").map((line) => `<${language}>${line}</${language}>`);
  });

  assert.deepEqual(highlighted, [[script, "bash"]]);
  assert.equal(rendered[1], "<bash>for file in *.json; do</bash>");
  assert.equal(rendered[3], "<bash>done</bash>");
});

test("does not parse quoted heredoc-like text", () => {
  const script = "printf '%s' '<<EOF'\necho text";
  const highlighted: Array<[string, string | undefined]> = [];
  const rendered = highlightShellCommandLines(script, plainTheme, (code, language) => {
    highlighted.push([code, language]);
    return code.split("\n");
  });

  assert.deepEqual(highlighted, [[script, "bash"]]);
  assert.deepEqual(rendered, ["printf '%s' '<<EOF'", "echo text"]);
});

test("renders commit-message heredocs as plain text", () => {
  const themed: CompactTheme = {
    fg: (color, text) => `<${color}>${text}</${color}>`,
  };
  const rendered = highlightShellCommandLines(
    "git commit -F - <<'EOF'\nfeat: improve cards\n\nExplain **why**.\nEOF",
    themed,
    () => {
      throw new Error("plain text must not use the code highlighter");
    },
  );

  assert.equal(rendered[1], "<text>feat: improve cards</text>");
  assert.equal(rendered[2], "<text></text>");
  assert.equal(rendered[3], "<text>Explain **why**.</text>");
});

test("shows bounded output previews for Bash calls and failed file tools", () => {
  assert.deepEqual(
    previewToolResult("bash", {
      content: [{ type: "text", text: "one\ntwo\nthree\nfour\nfive\nsix\nseven" }],
    }),
    ["three", "four", "five", "six", "seven", "", "... 2 more lines, press Ctrl+O to expand"],
  );
  assert.deepEqual(
    previewToolResult(
      "write",
      { content: [{ type: "text", text: "Permission denied" }] },
      5,
      "Ctrl+O to expand",
      true,
    ),
    ["Permission denied"],
  );
  assert.deepEqual(
    previewToolResult("write", { content: [{ type: "text", text: "Wrote file" }] }),
    [],
  );
});

test("renders bordered cards with previews and metadata", () => {
  const card = new CompactToolCard()
    .updateCall(
      "bash",
      "mise run build",
      { symbol: "✓", color: "success", expanded: false },
      undefined,
      plainTheme,
    )
    .updateResult(["built package", "... 2 more lines, press Ctrl+O to expand"], undefined, {
      durationMs: 1530,
      timeoutMs: 1_200_000,
      words: 42,
    });

  assert.deepEqual(card.render(60), [
    "┌──────────────────────────────────────────────────────────┐",
    "│  ➔ Bash ✓ |                                              │",
    "│  ──────────────────────────────────────────────────────  │",
    "│  $ mise run build                                        │",
    "│  ──────────────────────────────────────────────────────  │",
    "│  built package                                           │",
    "│  ... 2 more lines, press Ctrl+O to expand                │",
    "│  ──────────────────────────────────────────────────────  │",
    "│  ◷ 1.53s · ⏹ 1200s · ✎ ~42 words                         │",
    "└──────────────────────────────────────────────────────────┘",
  ]);
});

test("renders collapsed informational tools as compact cards", () => {
  const readCard = new CompactToolCard()
    .setCompact()
    .updateCall(
      "read",
      "Path: mise.toml:1-240",
      { symbol: "✓", color: "success", expanded: false },
      "240 lines",
      plainTheme,
    )
    .updateResult([], undefined, { durationMs: 3, words: 388 });
  const readLines = readCard.render(100);

  assert.equal(readLines.length, 3);
  assert.match(
    readLines[1] ?? "",
    /^│  ➔ Read ✓ \| Path: mise\.toml:1-240\s+\| ◷ 3ms · ✎ ~388 words  │$/u,
  );
  assert.ok(readLines.every((line) => visibleWidth(line) <= 100));

  const searchCard = new CompactToolCard()
    .setCompact()
    .updateCall(
      "grep",
      "Query: /pulumi/ in current directory",
      { symbol: "✓", color: "success", expanded: false },
      "56 results",
      plainTheme,
    )
    .updateResult([], undefined, { durationMs: 30, words: 1700 });
  assert.match(
    searchCard.render(100)[1] ?? "",
    /➔ Search ✓ \| Query: \/pulumi\/ in current directory/u,
  );

  readCard.updateCall(
    "read",
    "Path: mise.toml:1-240",
    { symbol: "✓", color: "success", expanded: true },
    "240 lines",
    plainTheme,
  );
  assert.ok(readCard.render(100).length > 3);
});

test("uses separate active-theme tones without painting a status background", () => {
  const foregroundCalls: Array<[string, string]> = [];
  const themed: CompactTheme = {
    fg(color, text) {
      foregroundCalls.push([color, text]);
      return text;
    },
  };
  const card = new CompactToolCard()
    .updateCall(
      "bash",
      "mise run build",
      { symbol: "✓", color: "success", expanded: false },
      undefined,
      themed,
    )
    .updateResult(["built package", "... 2 more lines, press Ctrl+O to expand"], undefined, {});

  card.render(60);

  assert.ok(foregroundCalls.some(([color, text]) => color === "accent" && text === "➔"));
  assert.ok(foregroundCalls.some(([color, text]) => color === "toolTitle" && text === "Bash"));
  assert.ok(foregroundCalls.some(([color, text]) => color === "bashMode" && text === "$ "));
  assert.ok(
    foregroundCalls.some(([color, text]) => color === "toolOutput" && text === "built package"),
  );
  assert.ok(
    foregroundCalls.some(
      ([color, text]) => color === "muted" && text.startsWith("... 2 more lines"),
    ),
  );

  foregroundCalls.length = 0;
  new CompactToolCard()
    .updateCall(
      "bash",
      "false",
      { symbol: "✗", color: "error", expanded: false },
      "exit code: 1",
      themed,
    )
    .updateResult(["failed"], undefined, {})
    .render(60);
  assert.ok(foregroundCalls.some(([color, text]) => color === "error" && text === "failed"));
});

test("registers card renderers before session_start so reload can rebuild history", () => {
  const registered: any[] = [];
  const pi = {
    on() {},
    registerTool() {
      throw new Error("Rendering must not replace tool execution");
    },
    registerToolRenderer(resolve: any) {
      for (const name of ["bash", "read", "edit", "write", "grep", "find", "ls", "codemode"]) {
        registered.push({ name, ...resolve(name, () => undefined) });
      }
      const sentinel = {};
      assert.equal(
        resolve("other", () => sentinel),
        sentinel,
      );
    },
  } as unknown as ExtensionAPI;

  toolCardsExtension(pi);

  assert.deepEqual(
    registered.map((definition) => definition.name),
    ["bash", "read", "edit", "write", "grep", "find", "ls", "codemode"],
  );
  assert.equal(registered[0].renderShell, "self");

  const state = {};
  const context = {
    args: { command: "mise run build" },
    argsComplete: true,
    cwd: "/repo",
    executionStarted: true,
    expanded: false,
    isError: false,
    isPartial: false,
    lastComponent: undefined,
    state,
  };
  const card = registered[0].renderCall(context.args, plainTheme, context);
  const result = registered[0].renderResult(
    { content: [{ type: "text", text: "one\ntwo" }] },
    { expanded: false, isPartial: false },
    plainTheme,
    { ...context, lastComponent: undefined },
  );

  assert.ok(card instanceof CompactToolCard);
  assert.ok(result instanceof EmptyToolResult);
  assert.match(card.render(80)[0], /^┌─+┐$/u);
  assert.match(card.render(80)[1] ?? "", /^│  ➔ Bash ✓ \|/u);
  assert.match(card.render(80)[3] ?? "", /^│  \$ mise run build\s+│$/u);

  const readContext = {
    ...context,
    args: { path: "src/index.ts" },
    state: {},
  };
  const readCard = registered[1].renderCall(readContext.args, plainTheme, readContext);
  const renderedRead = readCard.render(80).join("\n");
  assert.match(renderedRead, /file:\/\/\/repo\/src\/index\.ts/u);
  assert.match(renderedRead, /Path: src\/index\.ts/u);
});
