import { createConnection } from "node:net";
import { join } from "node:path";
import { privateDirectory, record, type ChildConfig } from "./storage.ts";

export interface ChildRequest {
  child: string;
  session: string;
  op: "status" | "send" | "cancel";
  id: string;
  task?: { id: string; text: string };
  delivery?: "followUp" | "steer";
}

/** One submission only. A lost acknowledgement is never an invitation to retry. */
export async function requestChild(config: ChildConfig, request: ChildRequest): Promise<unknown> {
  await privateDirectory(config.socketDirectory);
  return new Promise((resolve, reject) => {
    const socket = createConnection(join(config.socketDirectory, "input.sock"));
    let buffer = "";
    let finished = false;
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(5000, () =>
      fail(new Error("Child acknowledgement timed out. Inspect before retrying.")),
    );
    socket.on("error", (error) =>
      fail(
        new Error(
          `Child delivery unavailable or uncertain: ${error.message}. Inspect before retrying.`,
        ),
      ),
    );
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", (data) => {
      if (finished) return;
      buffer += data.toString();
      if (Buffer.byteLength(buffer) > 131_072)
        return fail(new Error("Child response exceeded its limit"));
      if (!buffer.includes("\n")) return;
      try {
        const response: unknown = JSON.parse(buffer.split("\n")[0]!);
        if (!record(response) || response.ok !== true) {
          throw new Error(
            record(response) && typeof response.error === "string"
              ? response.error
              : "Invalid child response",
          );
        }
        finished = true;
        socket.destroy();
        resolve(response.value);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
    socket.on("end", () => {
      if (!finished) fail(new Error("Child acknowledgement lost. Inspect before retrying."));
    });
  });
}
