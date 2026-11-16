import assert from "node:assert/strict";
import test from "node:test";
import { piCommand } from "../command.ts";

test("launches the current Pi installation without replaying parent startup flags", () => {
  assert.deepEqual(piCommand("/opt/pi", ["/opt/pi", "--resume", "old"]), ["/opt/pi"]);
  assert.deepEqual(
    piCommand("/opt/node", ["/opt/node", "/packages/pi/cli.js", "--session", "old"]),
    ["/opt/node", "/packages/pi/cli.js"],
  );
  assert.throws(() => piCommand("/opt/node", ["/opt/node", "--resume"]));
});
