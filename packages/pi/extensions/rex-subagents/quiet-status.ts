import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { formatProgramStatus, type ProgramStatus } from "@earendil-works/pi-tui";

type QuietStatus = Omit<ProgramStatus, "state"> & {
  state: "idle" | "working" | "blocked" | "clear";
};

interface QuietTerminal {
  enabled: boolean;
  isTTY: boolean;
  write(text: string): void;
}

/** Report child activity without taking completion attention away from the parent. */
export function installQuietChildStatus(
  pi: ExtensionAPI,
  terminal: QuietTerminal = {
    enabled: process.env.PI_PROGRAM_STATUS === "0" && Boolean(process.env.REX_BLOCK),
    isTTY: Boolean(process.stdout.isTTY),
    write: (text) => {
      process.stdout.write(text);
    },
  },
) {
  if (!terminal.enabled) return { enabled: false };

  let current: ExtensionContext | undefined;
  let running = false;
  let compacting = false;
  let prompt: { kind: "permission" | "question" | "auth"; title?: string } | undefined;
  let previous: string | undefined;

  const write = (status: QuietStatus) => {
    if (current?.mode !== "tui" || !terminal.isTTY) return;
    const encoded = formatProgramStatus(status);
    if (encoded === previous) return;
    terminal.write(encoded);
    previous = encoded;
  };
  const update = () => {
    const message = prompt?.title || current?.sessionManager.getSessionName() || "Pi subagent";
    write({
      state: prompt ? "blocked" : running || compacting ? "working" : "idle",
      app: "pi",
      ...(prompt ? { kind: prompt.kind } : {}),
      message,
    });
  };

  pi.on("session_start", (_event, ctx) => {
    current = ctx;
    running = !ctx.isIdle();
    compacting = false;
    prompt = undefined;
    previous = undefined;
    update();
  });
  pi.on("agent_start", () => {
    running = true;
    update();
  });
  pi.on("agent_settled", () => {
    // Retries, queued work, errors and cancellation all settle to ready/idle.
    running = false;
    compacting = false;
    update();
  });
  pi.on("ui_prompt_start", (event) => {
    prompt = {
      kind: event.kind === "confirm" ? "permission" : "question",
      title: event.title,
    };
    update();
  });
  pi.on("ui_prompt_end", () => {
    prompt = undefined;
    update();
  });
  pi.on("session_before_compact", () => {
    compacting = true;
    update();
  });
  const compactionFinished = () => {
    compacting = false;
    update();
  };
  pi.on("session_compact", compactionFinished);
  pi.on("session_compact_failed", compactionFinished);
  pi.on("session_shutdown", () => {
    // Clear our root record on reload, conversation replacement and quit.
    write({ state: "clear" });
    current = undefined;
    previous = undefined;
  });
  return { enabled: true };
}
