import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const mapping = (value: unknown): value is Record<string, any> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function parseMapping(text: string, label: string): Record<string, any> {
  const value = YAML.parse(text, { uniqueKeys: true });
  if (!mapping(value)) throw new Error(`${label}: expected a YAML mapping`);
  return value;
}

export function skillFiles(root = ROOT): string[] {
  const found: string[] = [];
  function walk(path: string) {
    for (const item of readdirSync(path, { withFileTypes: true })) {
      const file = join(path, item.name);
      if (item.isDirectory() && !["node_modules", ".git", "__pycache__"].includes(item.name))
        walk(file);
      else if (item.isFile() && item.name === "SKILL.md") found.push(file);
    }
  }
  for (const name of ["skills", ".agents/skills"]) {
    const directory = join(root, name);
    if (!statSync(directory).isDirectory()) throw new Error(`Missing skill root: ${directory}`);
    walk(directory);
  }
  return found.sort();
}

export function frontmatter(path: string) {
  const text = readFileSync(path, "utf8");
  const match = /^---\n([\s\S]*?)\n---(?=\n|$)/.exec(text);
  if (!match) throw new Error(`${path}: invalid or missing YAML frontmatter`);
  const data = parseMapping(match[1], path);
  if (typeof data.name !== "string" || !data.name) throw new Error(`${path}: missing skill name`);
  return { text, match, data };
}
