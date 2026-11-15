import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import * as TOML from "smol-toml";

type Config = Record<string, any>;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const isObject = (value: unknown): value is Config =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Objects merge recursively. Arrays and scalars replace. Null remains a literal value.
export function merge(...sources: Config[]): Config {
  const result: Config = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error(`Unsafe settings key: ${key}`);
      result[key] = isObject(value)
        ? merge(isObject(result[key]) ? result[key] : {}, value)
        : value;
    }
  }
  return result;
}

function optionalText(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}
function json(path: string): Config {
  const text = optionalText(path);
  const value = text ? JSON.parse(text) : {};
  if (!isObject(value)) throw new Error(`Expected a settings object: ${path}`);
  return value;
}
function config(path: string): Config {
  return path.endsWith(".toml") ? TOML.parse(optionalText(path)) : json(path);
}
function inside(path: string, parent: string): boolean {
  const rel = relative(parent, path);
  return rel === "" || (rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel));
}

export interface Options {
  home: string;
  output: string;
  privateRoot?: string;
}

export function render(options: Options): Map<string, string> {
  const { home, privateRoot } = options;
  if (privateRoot && !existsSync(privateRoot))
    throw new Error(`Private checkout does not exist: ${privateRoot}`);
  const defaults = resolve(root, "dotfiles");
  const inputs = resolve(root, "agent-config");
  const outputs = new Map<string, string>();
  const instructions = [
    ["codex", ".codex/AGENTS.md"],
    ["claude", ".claude/AGENTS.md"],
    ["gemini", ".gemini/GEMINI.md"],
    ["pi", ".pi/agent/AGENTS.md"],
    ["amp", ".config/amp/AGENTS.md"],
    ["opencode", ".config/opencode/AGENTS.md"],
  ];
  for (const [harness, destination] of instructions) {
    const parts = [
      optionalText(resolve(inputs, "shared-instructions.md")),
      optionalText(resolve(inputs, "harnesses", `${harness}-instructions.md`)),
      privateRoot ? optionalText(resolve(privateRoot, "instructions/shared.md")) : "",
      privateRoot ? optionalText(resolve(privateRoot, "instructions", `${harness}.md`)) : "",
    ]
      .map((text) => text.trim())
      .filter(Boolean);
    outputs.set(destination, parts.join("\n\n") + "\n");
  }
  // Write an ordinary file, not a second symlink owner.
  outputs.set(".claude/CLAUDE.md", outputs.get(".claude/AGENTS.md")!);
  const servers = merge(
    json(resolve(inputs, "mcp-servers.json")),
    privateRoot ? json(resolve(privateRoot, "settings/mcp-servers.json")) : {},
  );
  const codexMcp: Config = {};
  const claudeMcp: Config = {};
  for (const [name, server] of Object.entries(servers)) {
    if (!isObject(server) || (!server.url && !server.command))
      throw new Error(`Invalid MCP server: ${name}`);
    if (server.url) {
      codexMcp[name] = {
        url: server.url,
        ...(server.bearer_token_env ? { bearer_token_env_var: server.bearer_token_env } : {}),
        ...(server.headers ? { http_headers: server.headers } : {}),
      };
      claudeMcp[name] = {
        url: server.url,
        ...(server.bearer_token_env
          ? { env: { AUTH_TOKEN: `\${${server.bearer_token_env}}` } }
          : {}),
      };
    } else {
      codexMcp[name] = { command: server.command, args: server.args ?? [] };
      claudeMcp[name] = { command: server.command, args: server.args ?? [] };
    }
  }
  for (const [source, destination, harness] of [
    ["codex/config.toml", ".codex/config.toml", "codex"],
    ["claude/settings.json", ".claude/settings.json", "claude"],
    ["gemini/settings.json", ".gemini/settings.json", "gemini"],
    ["pi/settings.json", ".pi/agent/settings.json", "pi"],
  ]) {
    const value = merge(
      config(resolve(home, destination)),
      config(resolve(defaults, source)),
      privateRoot ? config(resolve(privateRoot, "settings", source)) : {},
    );
    if (harness === "codex") value.mcp_servers = merge(value.mcp_servers ?? {}, codexMcp);
    if (harness === "claude") value.mcpServers = merge(value.mcpServers ?? {}, claudeMcp);
    if (harness === "pi") {
      const packageRoot = resolve(root, "packages/pi");
      const packages = value.packages ?? [];
      if (!Array.isArray(packages)) throw new Error("Pi packages must be an array");
      const installed = packages.some((entry: string | { source: string }) => {
        const source = typeof entry === "string" ? entry : entry.source;
        return typeof source === "string" && resolve(home, ".pi/agent", source) === packageRoot;
      });
      value.packages = installed ? packages : [...packages, packageRoot];
    }
    outputs.set(
      destination,
      destination.endsWith(".toml") ? TOML.stringify(value) : JSON.stringify(value, null, 2) + "\n",
    );
  }
  return outputs;
}

export function generate(options: Options): string[] {
  const output = resolve(options.output);
  // Private results and machine activity must never be staged into the public checkout.
  let ancestor = output;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const physicalOutput = resolve(realpathSync(ancestor), relative(ancestor, output));
  if (inside(output, root) || inside(physicalOutput, realpathSync(root))) {
    throw new Error("Generated configuration must be outside the public checkout");
  }
  const outputs = render(options);
  // Preflight every path before changing any output. Refuse unrelated links, even broken ones.
  for (const name of outputs.keys()) {
    const path = resolve(output, name);
    let parent = dirname(path);
    while (parent !== output && inside(parent, output)) {
      if (existsSync(parent) && lstatSync(parent).isSymbolicLink())
        throw new Error(`Refusing symlink directory: ${parent}`);
      parent = dirname(parent);
    }
    if (existsSync(output) && lstatSync(output).isSymbolicLink())
      throw new Error(`Refusing symlink output: ${output}`);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error: any) {
      if (error.code !== "ENOENT") throw error;
    }
    if (stat?.isSymbolicLink()) throw new Error(`Refusing symlink output: ${path}`);
    if (stat && !stat.isFile()) throw new Error(`Refusing non-file output: ${path}`);
  }
  const changed: string[] = [];
  for (const [name, content] of outputs) {
    const path = resolve(output, name);
    if (existsSync(path) && readFileSync(path, "utf8") === content) {
      if ((lstatSync(path).mode & 0o777) !== 0o600) {
        chmodSync(path, 0o600);
        changed.push(name);
      }
      continue;
    }
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    const temp = `${path}.toolkit-${process.pid}.tmp`;
    writeFileSync(temp, content, { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
    changed.push(name);
  }
  return changed;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options: Options = {
    home: homedir(),
    output: "",
    privateRoot: process.env.TOOLKIT_PRIVATE_ROOT ? resolve(process.env.TOOLKIT_PRIVATE_ROOT) : undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!["--home", "--output", "--private"].includes(flag) || !args[i + 1]) {
      throw new Error("Usage: node src/index.ts --output DIR [--home DIR] [--private DIR]");
    }
    const value = resolve(args[++i]);
    if (flag === "--home") options.home = value;
    if (flag === "--output") options.output = value;
    if (flag === "--private") options.privateRoot = value;
  }
  if (!options.output)
    throw new Error("--output is required; use a temporary directory to preview");
  for (const name of generate(options)) console.log(`Generated ${name}`);
}
