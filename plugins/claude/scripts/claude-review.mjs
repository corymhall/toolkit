#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const MODES = new Set(["review", "adversarial"]);
const MAX_DIFF_CHARS = 160000;
const PROGRESS_INTERVAL_MS = 30000;

function usage() {
  return [
    "Usage:",
    "  node scripts/claude-review.mjs --mode <review|adversarial> [--base <ref>] [--scope working-tree|branch] [focus text]",
    "",
    "Examples:",
    "  node scripts/claude-review.mjs --mode review",
    "  node scripts/claude-review.mjs --mode adversarial --base main challenge the retry design"
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    mode: null,
    base: null,
    scope: "auto",
    focus: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      options.focus.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "--mode") {
      options.mode = argv[++index] ?? "";
      continue;
    }
    if (arg === "--base") {
      options.base = argv[++index] ?? "";
      continue;
    }
    if (arg === "--scope") {
      options.scope = argv[++index] ?? "";
      options.scopeExplicit = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option "${arg}". Put literal focus text after -- if needed.`);
    }
    options.focus.push(arg);
  }

  if (!MODES.has(options.mode)) {
    throw new Error("Missing or unsupported --mode. Use review or adversarial.");
  }
  if (!["auto", "working-tree", "branch"].includes(options.scope)) {
    throw new Error("Unsupported --scope. Use auto, working-tree, or branch.");
  }
  if (options.scope === "branch" && !options.base) {
    throw new Error("--scope branch requires --base <ref>.");
  }
  if (options.base && options.scopeExplicit && options.scope === "working-tree") {
    throw new Error("Choose either --base <ref> for branch review or --scope working-tree, not both.");
  }
  if (options.base) {
    options.scope = "branch";
  } else if (options.scope === "auto") {
    options.scope = "working-tree";
  }
  options.focusText = options.focus.join(" ").trim();
  return options;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    ...options
  });
}

function ensureClaude() {
  const result = run("claude", ["--version"]);
  if (result.error || result.status !== 0) {
    throw new Error("Claude Code is not available on PATH. Install or log in to Claude Code before using this skill.");
  }
}

function gitOutput(args) {
  const result = run("git", args);
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

function truncate(text, limit = MAX_DIFF_CHARS) {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}\n\n[diff truncated at ${limit} characters; inspect files directly for more context]`;
}

function gitOutputRaw(args) {
  const result = run("git", args);
  if (result.error || result.status !== 0) {
    return "";
  }
  return result.stdout;
}

function buildReviewTarget(options) {
  const repoRoot = gitOutput(["rev-parse", "--show-toplevel"]);
  const head = gitOutput(["rev-parse", "HEAD"]);
  const status = gitOutput(["status", "--short", "--untracked-files=all"]);

  if (options.scope === "branch") {
    const stat = gitOutputRaw(["diff", "--stat", `${options.base}...HEAD`]).trim();
    const diff = truncate(gitOutputRaw(["diff", `${options.base}...HEAD`]).trim());
    return {
      repoRoot,
      head,
      label: `branch diff against ${options.base}`,
      collection: [
        `Review the branch diff against ${options.base}.`,
        "The helper has already collected the branch diff below.",
        "Use Read, Glob, Grep, or LS only when more surrounding context is needed.",
        "Do not review unrelated working-tree changes unless they are part of the diff being evaluated."
      ].join("\n"),
      snapshot: [
        `Repository root: ${repoRoot || process.cwd()}`,
        `HEAD: ${head || "unknown"}`,
        `Base: ${options.base}`,
        "",
        "Current git status:",
        status || "(clean)",
        "",
        "Diff stat:",
        stat || "(empty)",
        "",
        "Diff:",
        diff || "(empty)"
      ].join("\n")
    };
  }

  const stagedDiff = gitOutputRaw(["diff", "--cached"]).trim();
  const unstagedDiff = gitOutputRaw(["diff"]).trim();
  const untrackedFiles = gitOutput(["ls-files", "--others", "--exclude-standard"]);

  return {
    repoRoot,
    head,
    label: "current working tree",
    collection: [
      "Review the current working tree, including staged changes, unstaged changes, and untracked files.",
      "The helper has already collected staged and unstaged diffs below.",
      "Use Read, Glob, Grep, or LS only when more surrounding context is needed.",
      "For untracked files, inspect the file contents directly when they are relevant."
    ].join("\n"),
    snapshot: [
      `Repository root: ${repoRoot || process.cwd()}`,
      `HEAD: ${head || "unknown"}`,
      "",
      "Current git status:",
      status || "(clean)",
      "",
      "Untracked files:",
      untrackedFiles || "(none)",
      "",
      "Staged diff:",
      truncate(stagedDiff) || "(empty)",
      "",
      "Unstaged diff:",
      truncate(unstagedDiff) || "(empty)"
    ].join("\n")
  };
}

function reviewPrompt(options, target) {
  const common = [
    "<role>",
    options.mode === "adversarial"
      ? "You are Claude Code performing an adversarial software review."
      : "You are Claude Code performing a senior software code review.",
    "</role>",
    "",
    "<task>",
    options.mode === "adversarial"
      ? "Find the strongest defensible reasons this change should not ship yet."
      : "Review the target change for material bugs, regressions, missing guards, and repo-instruction violations.",
    `Target: ${target.label}`,
    `User focus: ${options.focusText || "No extra focus provided."}`,
    "</task>",
    "",
    "<hard_constraints>",
    "Do not edit files.",
    "Do not run commands that modify the repository or external systems.",
    "Do not post GitHub comments, submit reviews, create issues, push branches, or call `gh pr comment`.",
    "Return the review in this chat only.",
    "</hard_constraints>",
    "",
    "<review_collection>",
    target.collection,
    "</review_collection>",
    "",
    "<finding_bar>",
    "Report only material findings an engineer should act on before shipping.",
    "Avoid style feedback, naming feedback, broad quality commentary, and speculative concerns without evidence.",
    "Do not report issues that are clearly pre-existing or outside the reviewed change.",
    "A finding should explain what can go wrong, why the code is vulnerable, likely impact, and a concrete recommendation.",
    "</finding_bar>",
    "",
    "<output_contract>",
    "Put findings first, ordered by severity.",
    "For each finding, include a file path and line reference when possible.",
    "Keep the review concise and specific.",
    "If you find no material issues, say that directly and mention any residual review limits.",
    "Do not include attribution footers or marketing text.",
    "</output_contract>",
    "",
    "<repository_snapshot>",
    target.snapshot,
    "</repository_snapshot>"
  ];

  if (options.mode === "adversarial") {
    common.splice(
      common.indexOf("<finding_bar>"),
      0,
      "<adversarial_stance>",
      "Default to skepticism.",
      "Look for violated invariants, rollback hazards, retry/idempotency gaps, race conditions, stale state, version skew, migration hazards, and observability gaps.",
      "Prefer one strong finding over several weak ones.",
      "</adversarial_stance>",
      ""
    );
  }

  return common.join("\n");
}

function projectLogDir(cwd = process.cwd()) {
  return path.join(os.homedir(), ".claude", "projects", cwd.replaceAll("/", "-"));
}

function textFromContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

function isTailReference(text) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return [
    "review i provided above",
    "review above stands",
    "findings above",
    "no additional findings"
  ].some((fragment) => normalized.includes(fragment));
}

function readTranscriptAssistantMessages(sessionId) {
  if (!sessionId) {
    return [];
  }

  const transcript = path.join(projectLogDir(), `${sessionId}.jsonl`);
  let body = "";
  try {
    body = fs.readFileSync(transcript, "utf8");
  } catch {
    return [];
  }

  const messages = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    try {
      const event = JSON.parse(line);
      if (event.type !== "assistant") {
        continue;
      }
      const text = textFromContent(event.message?.content).trim();
      if (text) {
        messages.push(text);
      }
    } catch {
      // Ignore partial or malformed transcript lines.
    }
  }
  return messages;
}

function bestReviewText(resultText, assistantMessages, sessionId) {
  const transcriptMessages = readTranscriptAssistantMessages(sessionId);
  const candidates = [...assistantMessages, ...transcriptMessages]
    .map((message) => message.trim())
    .filter(Boolean);

  const uniqueCandidates = [];
  for (const candidate of candidates) {
    if (uniqueCandidates[uniqueCandidates.length - 1] !== candidate) {
      uniqueCandidates.push(candidate);
    }
  }

  const substantive = uniqueCandidates.filter((message) => !isTailReference(message));
  if (substantive.length > 0 && (!resultText.trim() || isTailReference(resultText))) {
    return substantive.join("\n\n");
  }
  if (resultText.trim()) {
    return resultText.trim();
  }
  if (substantive.length > 0) {
    return substantive.join("\n\n");
  }
  return uniqueCandidates.join("\n\n");
}

function progress(message, force = false) {
  const now = Date.now();
  if (!force && now - progress.last < PROGRESS_INTERVAL_MS) {
    return;
  }
  progress.last = now;
  process.stderr.write(`[claude] ${message}\n`);
}
progress.last = 0;

function summarizeToolInput(input) {
  if (!input || typeof input !== "object") {
    return "";
  }
  const parts = [];
  for (const key of ["file_path", "path", "pattern", "query", "glob"]) {
    if (typeof input[key] === "string" && input[key]) {
      parts.push(`${key}=${JSON.stringify(input[key])}`);
    }
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function handleClaudeEvent(event, state) {
  if (event?.session_id && !state.sessionId) {
    state.sessionId = event.session_id;
  }

  if (event.type === "system") {
    if (event.subtype === "init") {
      state.sessionId = event.session_id ?? state.sessionId;
      progress(
        `session ${state.sessionId ?? "unknown"} started, model ${event.model ?? "unknown"}`,
        true
      );
      return;
    }
    if (event.subtype === "status" && event.status) {
      progress(`status: ${event.status}`);
      return;
    }
    if (event.subtype === "api_retry") {
      progress(
        `API retry ${event.attempt ?? "?"}/${event.max_retries ?? "?"} after ${event.retry_delay_ms ?? "?"}ms: ${event.error ?? "unknown"}`,
        true
      );
      return;
    }
    if (event.subtype === "hook_started") {
      progress(`hook started: ${event.hook_name ?? event.hook_event ?? "unknown"}`);
      return;
    }
    if (event.subtype === "hook_response") {
      progress(`hook finished: ${event.hook_name ?? event.hook_event ?? "unknown"} (${event.outcome ?? event.exit_code ?? "unknown"})`);
      return;
    }
  }

  if (event.type === "stream_event") {
    const streamEvent = event.event;
    if (streamEvent?.type === "content_block_delta" && streamEvent.delta?.type === "text_delta") {
      progress("streaming response text");
      return;
    }
    if (streamEvent?.type === "content_block_start" && streamEvent.content_block?.type === "tool_use") {
      progress(`tool: ${streamEvent.content_block.name ?? "unknown"}`, true);
      return;
    }
    if (streamEvent?.type === "message_delta" && streamEvent.delta?.stop_reason) {
      progress(`message stop reason: ${streamEvent.delta.stop_reason}`);
      return;
    }
  }

  if (event.type === "assistant") {
    for (const item of event.message?.content ?? []) {
      if (item?.type === "tool_use") {
        progress(`tool: ${item.name ?? "unknown"}${summarizeToolInput(item.input)}`, true);
      }
    }
    const text = textFromContent(event.message?.content).trim();
    if (text) {
      state.assistantMessages.push(text);
    }
    return;
  }

  if (event.type === "user") {
    for (const item of event.message?.content ?? []) {
      if (item?.type === "tool_result") {
        const content = typeof item.content === "string" ? item.content : "";
        const summary = content.length > 0 ? `${content.split(/\r?\n/).length} lines` : "empty";
        progress(`tool result: ${summary}`);
      }
    }
    return;
  }

  if (event.type === "result") {
    state.sessionId = event.session_id ?? state.sessionId;
    state.resultText = event.result ?? "";
    state.resultEvent = event;
    progress(`completed: ${event.terminal_reason ?? event.stop_reason ?? "done"} in ${event.duration_ms ?? "?"}ms`, true);
  }
}

function invokeClaude(prompt) {
  const allowedTools = [
    "Read",
    "Glob",
    "Grep",
    "LS"
  ].join(",");

  const sessionId = randomUUID();
  const state = {
    sessionId,
    assistantMessages: [],
    resultText: "",
    resultEvent: null,
    stderr: "",
    rawStdout: "",
    parseErrors: []
  };

  const args = [
    "-p",
    prompt,
    "--session-id",
    sessionId,
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--include-hook-events",
    "--allowedTools",
    allowedTools
  ];

  progress(`starting Claude session ${sessionId}`, true);

  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      state.rawStdout += chunk;
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          handleClaudeEvent(JSON.parse(line), state);
        } catch (error) {
          state.parseErrors.push(error instanceof Error ? error.message : String(error));
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      state.stderr += chunk;
      process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      resolve({
        status: 1,
        error,
        output: "",
        stderr: state.stderr,
        state
      });
    });

    child.on("close", (status) => {
      if (pending.trim()) {
        try {
          handleClaudeEvent(JSON.parse(pending), state);
        } catch (error) {
          state.parseErrors.push(error instanceof Error ? error.message : String(error));
        }
      }

      const output = bestReviewText(state.resultText, state.assistantMessages, state.sessionId);
      if (state.parseErrors.length > 0) {
        progress(`ignored ${state.parseErrors.length} malformed stream event(s)`, true);
      }
      resolve({
        status,
        error: null,
        output,
        stderr: state.stderr,
        state
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  ensureClaude();
  const target = buildReviewTarget(options);
  const result = await invokeClaude(reviewPrompt(options, target));

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.output || "Claude review failed.\n");
    process.exit(result.status ?? 1);
  }

  process.stdout.write(result.output.endsWith("\n") ? result.output : `${result.output}\n`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
