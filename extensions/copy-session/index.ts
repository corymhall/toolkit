import {
  copyToClipboard,
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
  pi.registerCommand("copy-session", {
    description: "Copy an Evaler prompt for this session, optionally with a question",
    handler: copySession,
  });

  pi.registerShortcut("ctrl+s", {
    description: "Copy an Evaler prompt for this session",
    handler: (ctx) => copySession("", ctx),
  });
}
