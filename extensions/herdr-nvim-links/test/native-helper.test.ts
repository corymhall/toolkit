import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test, { after, before } from "node:test";

const execFileAsync = promisify(execFile);
let directory = "";
let helper = "";
let fakeHerdr = "";
let fakeNvim = "";
let herdrLog = "";
let nvimLog = "";

before(async () => {
  if (process.platform !== "darwin") return;
  directory = await mkdtemp(join(tmpdir(), "herdr-nvim-native-test-"));
  helper = join(directory, "herdr-nvim-open");
  fakeHerdr = join(directory, "herdr");
  fakeNvim = join(directory, "nvim");
  herdrLog = join(directory, "herdr.log");
  nvimLog = join(directory, "nvim.log");

  execFileSync("swiftc", [
    "extensions/herdr-nvim-links/macos/HerdrNvimOpen.swift",
    "-o",
    helper,
  ]);
  execFileSync("swiftc", [
    "extensions/herdr-nvim-links/macos/URLHandler.swift",
    "-framework", "AppKit",
    "-o", join(directory, "url-handler"),
  ]);
  execFileSync("plutil", ["-lint", "extensions/herdr-nvim-links/macos/Info.plist"]);

  await writeFile(fakeHerdr, `#!/bin/sh
printf '%s\\n' "$*" >>"$TEST_HERDR_LOG"
case "$1 $2" in
  "pane list")
    if [ "$TEST_SCENARIO" = create ]; then
      printf '%s\\n' '{"result":{"panes":[{"pane_id":"w1:p1","workspace_id":"w1","tab_id":"w1:t1"}]}}'
    elif [ "$TEST_SCENARIO" = missing-server ]; then
      printf '%s\\n' '{"result":{"panes":[{"pane_id":"w1:p1","workspace_id":"w1","tab_id":"w1:t1"},{"pane_id":"w1:p2","workspace_id":"w1","tab_id":"w1:t1"}]}}'
    else
      printf '%s\\n' '{"result":{"panes":[{"pane_id":"w1:p1","workspace_id":"w1","tab_id":"w1:t1"},{"pane_id":"w1:p2","workspace_id":"w1","tab_id":"w1:t1","tokens":{"nvim_server":"/tmp/nvim.sock"}}]}}'
    fi
    ;;
  "pane neighbor")
    if [ "$TEST_SCENARIO" = create ]; then
      printf '%s\\n' '{"result":{"neighbor":{"pane_id":"w1:p1"}}}'
    else
      printf '%s\\n' '{"result":{"neighbor":{"pane_id":"w1:p1","neighbor_pane_id":"w1:p2"}}}'
    fi
    ;;
  "pane process-info")
    printf '%s\\n' '{"result":{"process_info":{"shell_pid":10,"foreground_processes":[{"pid":11,"name":"nvim","argv0":"nvim","argv":["nvim"]}]}}}'
    ;;
  "pane split")
    printf '%s\\n' '{"result":{"pane":{"pane_id":"w1:p3","workspace_id":"w1","tab_id":"w1:t1","terminal_id":"term3"}}}'
    ;;
  "pane focus"|"pane rename"|"pane run"|"pane report-metadata")
    printf '%s\\n' '{"result":{}}'
    ;;
  *)
    echo "unexpected herdr args: $*" >&2
    exit 2
    ;;
esac
`);
  await writeFile(fakeNvim, `#!/bin/sh
for arg in "$@"; do printf '<%s>\\n' "$arg"; done >>"$TEST_NVIM_LOG"
`);
  await chmod(fakeHerdr, 0o755);
  await chmod(fakeNvim, 0o755);
});

after(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

function link(file: string, line = 12): string {
  const url = new URL("herdr-nvim://open");
  url.searchParams.set("file", new URL(`file://${file}`).href);
  url.searchParams.set("sourcePane", "w1:p1");
  url.searchParams.set("workspace", "w1");
  url.searchParams.set("tab", "w1:t1");
  url.searchParams.set("cwd", "/tmp");
  url.searchParams.set("socket", "/tmp/herdr.sock");
  url.searchParams.set("line", String(line));
  return url.href;
}

async function invoke(scenario: string, uri: string) {
  await writeFile(herdrLog, "");
  await writeFile(nvimLog, "");
  return execFileAsync(helper, [uri], {
    env: {
      ...process.env,
      HERDR_NVIM_HERDR_PATH: fakeHerdr,
      HERDR_NVIM_NVIM_PATH: fakeNvim,
      TEST_HERDR_LOG: herdrLog,
      TEST_NVIM_LOG: nvimLog,
      TEST_SCENARIO: scenario,
    },
  });
}

test("native helper opens the right Neovim through RPC and focuses it", {
  skip: process.platform !== "darwin",
}, async () => {
  await invoke("existing", link("/tmp/file with spaces.ts", 27));
  const herdrCalls = await readFile(herdrLog, "utf8");
  const nvimCalls = await readFile(nvimLog, "utf8");

  assert.match(herdrCalls, /pane list --workspace w1/);
  assert.match(herdrCalls, /pane neighbor --direction right --pane w1:p1/);
  assert.match(herdrCalls, /pane process-info --pane w1:p2/);
  assert.match(herdrCalls, /pane focus --direction right --pane w1:p1/);
  assert.match(nvimCalls, /<--server>\n<\/tmp\/nvim\.sock>\n<--remote-expr>/);
  assert.match(nvimCalls, /fnameescape\("\\\/tmp\\\/file with spaces\.ts"\)/);
  assert.match(nvimCalls, /cursor\(27, 1\)/);
});

test("native helper refuses to inject keys into an unadvertised Neovim", {
  skip: process.platform !== "darwin",
}, async () => {
  await assert.rejects(
    () => invoke("missing-server", link("/tmp/file.ts")),
    /advertised an RPC server/,
  );
  assert.equal(await readFile(nvimLog, "utf8"), "");
});

test("native helper creates and starts a right pane when Neovim is absent", {
  skip: process.platform !== "darwin",
}, async () => {
  await invoke("create", link("/tmp/it's here.ts", 9));
  const herdrCalls = await readFile(herdrLog, "utf8");

  assert.match(herdrCalls, /pane split --pane w1:p1 --direction right --ratio 0\.5 --cwd \/tmp --focus/);
  assert.match(herdrCalls, /pane rename w1:p3 neovim/);
  assert.match(herdrCalls, /pane run w1:p3 exec '/);
  assert.match(herdrCalls, /'\"'\"'/);
  assert.match(herdrCalls, /'\+9'/);
});

test("Neovim runtime advertises one RPC server and is idempotent", async () => {
  const nvim = process.env.HERDR_NVIM_REAL_NVIM ?? "/opt/homebrew/bin/nvim";
  if (!directory || !process.env.PATH || !requireExecutable(nvim)) return;
  await writeFile(herdrLog, "");

  await execFileAsync(nvim, [
    "--headless",
    "-u", "NONE",
    "--cmd", `set runtimepath+=${process.cwd()}/extensions/herdr-nvim-links/nvim`,
    "+runtime plugin/herdr_nvim.lua",
    "+runtime plugin/herdr_nvim.lua",
    "+sleep 500m",
    "+qa",
  ], {
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      HERDR_ENV: "1",
      HERDR_PANE_ID: "w1:p2",
      TEST_HERDR_LOG: herdrLog,
      TEST_SCENARIO: "existing",
    },
  });

  const calls = (await readFile(herdrLog, "utf8")).trim().split("\n").filter(Boolean);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^pane report-metadata w1:p2 --source herdr-nvim --token nvim_server=\//);
});

function requireExecutable(path: string): boolean {
  try {
    execFileSync("test", ["-x", path]);
    return true;
  } catch {
    return false;
  }
}
