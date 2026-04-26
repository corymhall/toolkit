# Model CLI Adapters

Use this reference only when actually dispatching external model helpers.

The goal is read-only evidence gathering. Prefer pre-collected context in the
prompt over giving helper CLIs broad repo access. If tool access is useful, use
read-only or planning modes.

## Availability

Check for helpers before dispatch:

```bash
command -v claude
command -v gemini
```

If a CLI is missing, unauthenticated, or fails before producing useful output,
continue with the available evidence and report the missing helper as residual
risk.

## Prompt Files

Use prompt files for non-trivial inputs so quoting and shell limits do not
distort the request:

```bash
prompt_file="$(mktemp)"
stdout_file="$(mktemp)"
stderr_file="$(mktemp)"
```

Write the prompt into `prompt_file` using a heredoc or an editor-safe file
operation. Keep the prompt narrow: decision, constraints, artifact, and the
specific findings requested.

## Claude

For a read-only text response from Claude Code:

```bash
claude -p \
  --permission-mode plan \
  --tools "" \
  --output-format text \
  "$(cat "$prompt_file")" \
  >"$stdout_file" 2>"$stderr_file"
```

Useful options:

- `-p` / `--print`: non-interactive mode
- `--output-format text`: easiest format to synthesize
- `--output-format json`: useful when you need metadata or machine parsing
- `--permission-mode plan`: keep the helper in read-only/planning mode
- `--tools ""`: disable tools entirely when the prompt already contains all
  needed context
- `--model sonnet` or `--model opus`: choose explicitly only when the user or
  task calls for it

If Claude has a relevant native review skill or slash command, prefer it over a
generic prompt for that helper. Examples on this machine have included:

- `/code-review:code-review` for PR review
- `/security-review` for security-sensitive changes
- `/simplify` for reuse, quality, and efficiency review

Only invoke native skills that are actually available in the helper runtime. If
availability is unclear, ask Claude directly for the review lens instead of
assuming a slash command exists.

## Gemini

For a read-only text response from Gemini CLI:

```bash
gemini \
  --approval-mode plan \
  --output-format text \
  -p "$(cat "$prompt_file")" \
  >"$stdout_file" 2>"$stderr_file"
```

Useful options:

- `-p` / `--prompt`: non-interactive mode
- `--output-format text`: easiest format to synthesize
- `--output-format json`: useful when you need metadata or machine parsing
- `--approval-mode plan`: keep the helper in read-only/planning mode
- `--model <model>`: choose explicitly only when the user or task calls for it

Avoid `-y` / `--yolo` for review helpers. It auto-accepts actions and is the
wrong default for read-only evaluation.

## Output Handling

Treat helper outputs as leads:

- read `stdout_file` first
- summarize useful findings, assumptions, and evidence
- inspect `stderr_file` only for failures, warnings, auth problems, or timeout
  clues
- do not paste full transcripts unless the user asks
- verify actionable findings against the artifact or repo before reporting them

## Failure Handling

Continue with partial results when a helper fails.

Use a 10 minute budget as the default for each helper. Enforce it through the
current runner or session controls when available; do not depend on a
non-portable shell command being installed.

Report concise limitations:

- CLI missing: helper was not installed or not on `PATH`
- auth failure: helper could not authenticate
- timeout: helper exceeded the time budget
- empty output: helper ran but produced no useful findings
- non-zero exit: include a short stderr summary if it explains the failure

Do not retry indefinitely. One retry is reasonable only when the failure is
clearly transient or caused by an overly large prompt that can be narrowed.
