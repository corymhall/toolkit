import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

// Lifecycle-only structural types keep this dotfiles extension independent of
// an npm-installed Pi SDK. Pi loads the file directly with its extension loader.
interface Context {
  mode?: string;
  hasUI: boolean;
  cwd: string;
  sessionManager: {
    getSessionId(): string;
    getSessionFile(): string | undefined;
  };
  ui: { notify(message: string, level: "warning"): void };
}
interface ExtensionAPI {
  on(event: string, handler: (event: unknown, ctx: Context) => Promise<void>): void;
  sendUserMessage(text: string, options: { deliverAs: "followUp" }): void;
}

// A private local endpoint uses Pi's queue API without touching its editor.
// Socket permissions restrict callers to this user. Session IDs prevent sending
// to a different conversation after /new or /resume. No messages are persisted.
function agentInput(pi: ExtensionAPI) {
  let close = async () => {};
  pi.on("session_start", async (_event, ctx) => {
    await close();
    if (!process.env.REX_SERVER || !process.env.REX_BLOCK || ctx.mode !== "tui") return;
    const id = randomUUID();
    const root =
      process.env.REX_AGENT_INPUT_DIR ??
      join(process.env.XDG_STATE_HOME ?? join(homedir(), ".local/state"), "rex/agent-input");
    // macOS Unix socket paths must fit in 104 bytes. Keep sockets out of HOME.
    const socketDir = `/tmp/rex-pi-${process.getuid?.() ?? "user"}-${id}`;
    const socket = join(socketDir, "input.sock");
    const file = join(root, `${id}.json`);
    const session = ctx.sessionManager.getSessionId();
    let active = true;
    const server = createServer((client) => {
      client.setEncoding("utf8");
      client.setTimeout(5000, () => client.destroy());
      let buffer = "";
      let handled = false;
      client.on("error", () => {});
      client.on("data", async (chunk) => {
        if (handled) return;
        buffer += chunk;
        if (Buffer.byteLength(buffer) > 256 * 1024) {
          client.destroy();
          return;
        }
        if (!buffer.includes("\n")) return;
        handled = true;
        try {
          const request = JSON.parse(buffer.slice(0, buffer.indexOf("\n")));
          if (!active || request.session_id !== session)
            throw new Error("Agent session changed. Reopen the picker.");
          if (
            typeof request.text !== "string" ||
            !request.text.trim() ||
            Buffer.byteLength(request.text) > 64 * 1024 ||
            /[\x00-\x08\x0b-\x1f\x7f]/.test(request.text)
          ) {
            throw new Error(
              "Message must contain text, without control characters, and be at most 64 KiB.",
            );
          }
          await pi.sendUserMessage(request.text, { deliverAs: "followUp" });
          client.end(JSON.stringify({ ok: true }) + "\n");
        } catch (error) {
          client.end(JSON.stringify({ ok: false, error: String(error) }) + "\n");
        }
      });
    });
    close = async () => {
      active = false;
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      await Promise.all([
        unlink(file).catch(() => {}),
        unlink(file + ".tmp").catch(() => {}),
        unlink(socket).catch(() => {}),
      ]);
      await rmdir(socketDir).catch(() => {});
    };
    try {
      await mkdir(root, { recursive: true, mode: 0o700 });
      await chmod(root, 0o700);
      // Protect the socket before listen, including the interval before chmod.
      await mkdir(socketDir, { mode: 0o700 });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(socket, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      await chmod(socket, 0o600);
      const metadata = {
        socket,
        session_id: session,
        cwd: ctx.cwd,
        pid: process.pid,
        server: process.env.REX_SERVER,
        block: process.env.REX_BLOCK,
      };
      await writeFile(file + ".tmp", JSON.stringify(metadata), { mode: 0o600 });
      await rename(file + ".tmp", file);
    } catch (error) {
      await close();
      ctx.ui.notify(`Rex agent input unavailable: ${String(error)}`, "warning");
    }
  });
  pi.on("session_shutdown", async () => close());
}

export default function (pi: ExtensionAPI) {
  agentInput(pi);
  let warned = false;
  const report = async (ctx: Context, stop = false) => {
    if (!process.env.REX_SERVER || !process.env.REX_BLOCK || !ctx.hasUI || ctx.mode !== "tui")
      return;
    const helper =
      process.env.REX_WORKSPACE_HELPER ?? join(homedir(), ".config/rex/agent-state.py");
    const payload = {
      pid: process.pid,
      cwd: ctx.cwd,
      session_id: ctx.sessionManager.getSessionId(),
      file: ctx.sessionManager.getSessionFile() ?? null,
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          "/bin/sh",
          [
            "-c",
            'export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:/opt/homebrew/bin:$PATH"; exec python3 "$@"',
            "rex-registration",
            helper,
            stop ? "pi-stop" : "pi",
          ],
          { stdio: ["pipe", "ignore", "pipe"] },
        );
        let stderr = "";
        child.stderr.on("data", (data: Buffer) => {
          stderr = (stderr + data.toString()).slice(-1000);
        });
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          reject(new Error("registration timed out"));
        }, 5000);
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error(stderr || `registration exited ${code}`));
        });
        child.stdin.on("error", () => {});
        child.stdin.end(JSON.stringify(payload));
      });
    } catch (error) {
      if (!warned && !stop) {
        warned = true;
        ctx.ui.notify(`Rex workspace registration failed: ${String(error)}`, "warning");
      }
    }
  };
  for (const event of ["session_start", "agent_start", "agent_settled"]) {
    pi.on(event, async (_event, ctx) => report(ctx));
  }
  pi.on("session_shutdown", async (_event, ctx) => report(ctx, true));
}
