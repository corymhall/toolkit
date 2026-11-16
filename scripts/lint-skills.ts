import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import YAML from "yaml";
import { frontmatter, skillFiles } from "./skills.ts";

const directory = mkdtempSync(join(tmpdir(), "toolkit-skill-lint-"));
const skills = skillFiles();
let failures = 0;
try {
  if (!skills.length) throw new Error("No skills found");
  for (const file of skills) {
    try {
      const { data, text, match } = frontmatter(file);
      const field = "disable-model-invocation";
      if (field in data && typeof data[field] !== "boolean")
        throw new Error(`${field} must be a boolean`);
      delete data[field];
      const target = join(directory, basename(dirname(file)));
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target);
      writeFileSync(
        join(target, "SKILL.md"),
        `---\n${YAML.stringify(data)}---${text.slice(match[0].length)}`,
      );
      const result = spawnSync("agentskills", ["validate", target], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error("specification validation failed");
    } catch (error) {
      console.error(`${file}: ${String(error)}`);
      failures++;
    }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
if (failures) process.exitCode = 1;
else console.log(`Validated ${skills.length} skills against the Agent Skills specification.`);
