import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { ROOT, skillFiles } from "./skills.ts";

const errors: string[] = [];
for (const name of ["package.json", "package-lock.json"]) {
  try {
    JSON.parse(readFileSync(join(ROOT, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${String(error)}`);
  }
}
const owners = new Map<string, string>();
const skills = skillFiles();
if (!skills.length) errors.push("no skills found");
for (const file of skills) {
  const name = basename(dirname(file));
  if (owners.has(name))
    errors.push(`duplicate skill directory name ${name}: ${owners.get(name)}, ${file}`);
  owners.set(name, file);
}
const ignored = new Set([
  ".git",
  ".mise",
  ".worktrees",
  "apm_modules",
  "__pycache__",
  "node_modules",
]);
const suffixes = new Set([
  ".go",
  ".js",
  ".json",
  ".jsonl",
  ".md",
  ".mjs",
  ".pkl",
  ".py",
  ".sh",
  ".toml",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);
const names = new Set([".gitignore", "AGENTS.md", "LICENSE"]);
const paths = new Set(
  execFileSync(
    "git",
    ["-C", ROOT, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { encoding: "utf8" },
  ).split("\0"),
);
let count = 0;
for (const name of paths) {
  const path = join(ROOT, name);
  if (
    !name ||
    name.startsWith(".agents/skills/") ||
    name.split("/").some((p) => ignored.has(p)) ||
    !existsSync(path) ||
    !statSync(path).isFile()
  )
    continue;
  if (!names.has(basename(path)) && !suffixes.has(extname(path))) continue;
  count++;
  const text = readFileSync(path, "utf8");
  if (text && !text.endsWith("\n")) errors.push(`${name}: missing final newline`);
  text.split(/\r?\n/).forEach((line, index) => {
    if (/[ \t]+$/.test(line)) errors.push(`${name}:${index + 1}: trailing whitespace`);
  });
}
if (errors.length) {
  console.error(errors.map((e) => `error: ${e}`).join("\n"));
  process.exitCode = 1;
} else
  console.log(`Validated repository policy for ${skills.length} skills and ${count} source files.`);
