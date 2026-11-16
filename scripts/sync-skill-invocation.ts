import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import YAML from "yaml";
import { ROOT, frontmatter, mapping, parseMapping, skillFiles } from "./skills.ts";

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}
function allowed(data: Record<string, unknown>, keys: string[], label: string) {
  const extra = Object.keys(data).filter((k) => !keys.includes(k));
  if (extra.length) throw new Error(`${label}: unknown fields: ${extra.join(", ")}`);
}
function existingOpenAI(text: string, path: string, enabled: boolean): string {
  const data = parseMapping(text, path);
  if (data.policy != null && !mapping(data.policy))
    throw new Error(`${path}: policy must be a mapping`);
  const has = mapping(data.policy) && "allow_implicit_invocation" in data.policy;
  if (has) boolean(data.policy.allow_implicit_invocation, path);
  const field = /^  allow_implicit_invocation:[^\n]*$/gm;
  const matches = [...text.matchAll(field)];
  if (matches.length > 1 || !!matches.length !== !!has)
    throw new Error(`${path}: policy must use unambiguous block YAML`);
  if (enabled) {
    if (!has) return text;
    if (Object.keys(data.policy).length === 1) {
      const block = /^policy:[ \t]*(?:#.*)?\n  allow_implicit_invocation:[^\n]*\n?/gm;
      if ([...text.matchAll(block)].length !== 1)
        throw new Error(`${path}: cannot remove empty policy block`);
      return text.replace(block, "");
    }
    return text.replace(/^  allow_implicit_invocation:[^\n]*\n?/m, "");
  }
  if (has) return text.replace(field, "  allow_implicit_invocation: false");
  const policies = [...text.matchAll(/^policy:[ \t]*(?:#.*)?$/gm)];
  if (policies.length > 1) throw new Error(`${path}: duplicate policy`);
  if (policies.length) {
    const position = policies[0].index! + policies[0][0].length;
    return `${text.slice(0, position)}\n  allow_implicit_invocation: false${text.slice(position)}`;
  }
  return `${text}${text.endsWith("\n") ? "" : "\n"}policy:\n  allow_implicit_invocation: false\n`;
}

try {
  const { values } = parseArgs({
    options: { check: { type: "boolean" }, root: { type: "string" }, config: { type: "string" } },
  });
  const root = resolve(values.root ?? ROOT);
  const configPath = values.config ?? "skill-invocation.yaml";
  const config = parseMapping(
    readFileSync(isAbsolute(configPath) ? configPath : join(root, configPath), "utf8"),
    "invocation policy",
  );
  allowed(config, ["version", "skills"], "invocation policy");
  if (config.version !== 1 || !mapping(config.skills))
    throw new Error("Expected policy version 1 and a skills mapping");
  const skills = new Map<string, ReturnType<typeof frontmatter> & { path: string }>();
  for (const path of skillFiles(root)) {
    const skill = frontmatter(path);
    if (skills.has(skill.data.name)) throw new Error(`Duplicate skill name: ${skill.data.name}`);
    skills.set(skill.data.name, { ...skill, path });
  }
  const missing = [...skills.keys()].filter((n) => !(n in config.skills));
  const stale = Object.keys(config.skills).filter((n) => !skills.has(n));
  if (missing.length || stale.length)
    throw new Error(`Policy coverage: missing=${missing.join(",")} stale=${stale.join(",")}`);
  const desired = new Map<string, string>();
  for (const [name, skill] of skills) {
    const policy = config.skills[name];
    if (!mapping(policy)) throw new Error(`${name}: expected policy mapping`);
    allowed(policy, ["model_invocable", "codex_model_invocable", "openai"], name);
    const enabled = boolean(policy.model_invocable, name);
    const codex = boolean(policy.codex_model_invocable ?? enabled, `${name}.codex_model_invocable`);
    if (skill.data["disable-model-invocation"] != null)
      boolean(skill.data["disable-model-invocation"], name);
    const field = /^disable-model-invocation:[^\n]*$/gm;
    if ([...skill.match[1].matchAll(field)].length > 1)
      throw new Error(`${name}: duplicate invocation field`);
    let header = skill.match[1]
      .replace(field, enabled ? "" : "disable-model-invocation: true")
      .replace(/\n+$/, "");
    if (!enabled && !field.test(skill.match[1])) header += "\ndisable-model-invocation: true";
    desired.set(skill.path, `---\n${header}\n---${skill.text.slice(skill.match[0].length)}`);
    const path = join(dirname(skill.path), "agents/openai.yaml");
    if (policy.openai != null) {
      if (!mapping(policy.openai)) throw new Error(`${name}: openai must be a mapping`);
      const data = structuredClone(policy.openai);
      if (data.policy != null && !mapping(data.policy))
        throw new Error(`${name}: template policy must be a mapping`);
      data.policy = { ...data.policy, allow_implicit_invocation: codex };
      desired.set(path, YAML.stringify(data, { lineWidth: 0 }));
    } else if (existsSync(path))
      desired.set(path, existingOpenAI(readFileSync(path, "utf8"), path, codex));
    else if (!codex) throw new Error(`${name}: missing agents/openai.yaml; add an openai template`);
  }
  const changes = [...desired].filter(
    ([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text,
  );
  if (values.check && changes.length)
    throw new Error(
      `Invocation metadata is stale: ${changes.map(([p]) => relative(root, p)).join(", ")}. Run mise run skills:sync-invocation`,
    );
  if (!values.check)
    for (const [path, text] of changes) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      console.log(`Updated ${relative(root, path)}`);
    }
  console.log(
    `${values.check ? "Validated" : "Synchronized"} invocation metadata for ${skills.size} skills.`,
  );
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
