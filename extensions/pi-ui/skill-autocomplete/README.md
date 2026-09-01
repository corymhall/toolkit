# Skill Autocomplete

Adds Codex-style `$` completion for Pi skills without changing normal
model-invocable skill behavior.

Type `$` at a token boundary anywhere in the editor and select a skill:

```text
Please use $go-development to refactor this package.
```

For a normal skill, the completed name remains ordinary prompt text. Pi already
shows that skill's name and description to the model, so the exact mention helps
the model select and load it on demand.

For a skill whose frontmatter contains:

```yaml
disable-model-invocation: true
```

the module labels the picker entry as `explicit invocation` and rewrites the
submitted prompt into Pi's required leading command. For example:

```text
Please use $commit for these changes.
```

is submitted as:

```text
/skill:commit Please use $commit for these changes.
```

Pi then performs its native skill expansion. The module reads invocation mode
from the same skill file returned by `pi.getCommands()` and uses Pi's exported
frontmatter parser.

Pi can natively expand only one leading `/skill:` command. If a prompt mentions
multiple distinct user-only skills, the module rejects the submission,
restores it to the editor, and shows a warning. Multiple model-invocable skills,
or repeated mentions of the same user-only skill, remain supported.

Skill slash commands must be enabled (Pi's default) so `pi.getCommands()` exposes
the available skills.
