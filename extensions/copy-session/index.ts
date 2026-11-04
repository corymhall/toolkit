import {
  copyToClipboard,
  SessionManager,
  SessionSelectorComponent,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { sessionReferencePrompt } from "./session-reference.ts";

async function copySession(args: string, ctx: ExtensionContext) {
  if (!ctx.hasUI) return;

  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) {
    ctx.ui.notify("This session is not saved. There is no session for Evaler to read.", "warning");
    return;
  }

  const question = args.trim();
  const prompt = sessionReferencePrompt(
    { file: sessionFile, id: ctx.sessionManager.getSessionId(), cwd: ctx.cwd },
    question,
  );

  try {
    await copyToClipboard(prompt);
    ctx.ui.notify("Copied session prompt. Paste it into another session.", "info");
  } catch (error) {
    ctx.ui.notify(
      `Could not copy session prompt: ${error instanceof Error ? error.message : String(error)}`,
      "error",
    );
  }
}

export default function copySessionExtension(pi: ExtensionAPI) {
  const referenceSession = async (_args: string, ctx: ExtensionContext) => {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("reference-session requires interactive mode", "warning");
      return;
    }

    const selected = await ctx.ui.custom<string | undefined>((tui, _theme, keybindings, done) => {
      const picker = new SessionSelectorComponent(
        (onProgress, signal) => SessionManager.list(ctx.cwd, undefined, onProgress, signal),
        (onProgress, signal) => SessionManager.listAll(onProgress, signal),
        done,
        () => done(undefined),
        () => done(undefined),
        () => tui.requestRender(),
        { keybindings, showRenameHint: false },
        ctx.sessionManager.getSessionFile(),
      );
      // Referencing sessions must never modify or delete them.
      picker.getSessionList().onDeleteSession = undefined;
      return picker;
    });

    if (selected) ctx.ui.pasteToEditor(selected);
  };

  pi.registerCommand("reference-session", {
    description: "Search saved sessions and paste a session file path into the editor",
    handler: referenceSession,
  });
  pi.registerShortcut("ctrl+alt+s", {
    description: "Insert a saved session reference into the current draft",
    handler: (ctx) => referenceSession("", ctx),
  });

  pi.registerCommand("copy-session", {
    description: "Copy an Evaler prompt for this session, optionally with a question",
    handler: copySession,
  });

  pi.registerShortcut("ctrl+s", {
    description: "Copy an Evaler prompt for this session",
    handler: (ctx) => copySession("", ctx),
  });
}
