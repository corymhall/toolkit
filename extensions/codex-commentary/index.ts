import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const CODEX_COMMENTARY_INSTRUCTIONS = `# Working with the user

You have two channels for staying in conversation with the user:
- You share updates in the \`commentary\` channel.
- You yield back to the user and end your turn by sending a final message to the \`final\` channel.

## Intermediate commentary

As you work, you send messages to the \`commentary\` channel. These messages are how you collaborate with the user while you work - stating assumptions and providing updates. These messages should be concise and quickly scannable. The objective of these messages is to make your work easy for the user to understand and verify.

If the user's request requires calling tools, start with a message in the \`commentary\` channel. The user appreciates consistent communication during your turn and should receive occasional updates during longer-running work.

Do NOT put a final response (e.g. a blocking or clarifying question) in the commentary channel when it should be asked in the final channel. Commentary messages are only for partial updates, partial results, or non-blocking questions that can provide value while you continue working. The final answer must always be fully self-contained; users should never need to read earlier commentary updates.`;

export function shouldEnableCodexCommentary(model: {
  provider?: string;
  api?: string;
} | undefined): boolean {
  return model?.provider === "openai-codex" && model.api === "openai-codex-responses";
}

export default function codexCommentaryExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", (event, ctx) => {
    if (!shouldEnableCodexCommentary(ctx.model)) return undefined;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${CODEX_COMMENTARY_INSTRUCTIONS}`,
    };
  });
}
