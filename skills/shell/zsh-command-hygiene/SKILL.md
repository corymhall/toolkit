---
name: zsh-command-hygiene
description: "Use when writing or repairing multi-line zsh shell commands, especially commands that create temp files, preserve exit statuses, parse JSON through shell pipelines, run cleanup, combine GitHub CLI calls with heredocs, or fail with zsh reserved-parameter errors such as `read-only variable: status`."
---

# Zsh Command Hygiene

Keep multi-line zsh commands boring and explicit.

## Guardrails

- Do not assign to zsh special parameters such as `status`, `pipestatus`,
  `signals`, `options`, `path`, `fpath`, `argv`, `ARGC`, `RANDOM`, or `SECONDS`.
- Preserve command exit codes in a neutral variable name such as `cmd_status`,
  `gh_status`, or `exit_code`.
- When capturing a pipeline result in zsh, never write
  `status=${pipestatus[1]}`. Use a neutral name such as
  `cmd_status=${pipestatus[1]}` after `cmd 2>&1 | sed ...`, or avoid the
  pipeline if truncation is not needed.
- Prefer `jq` for short JSON filters. Avoid nested Python f-strings with
  backslash-escaped dictionary keys inside `python3 -c`; shell and Python
  quoting interact badly. If Python is necessary, use a heredoc or a simple
  expression that does not nest quote syntaxes.
- Prefer `trap` for temp-file cleanup instead of manual `rm` after a command
  whose status you need to preserve.
- Quote temp paths and heredoc variables. Use single-quoted heredoc markers
  when the body should not expand shell variables.
- Keep optional file paths out of positional `rg` arguments unless you have
  verified they exist; use `--glob` filters or preflight with `test -e`.

## Safe Patterns

Temp file plus status preservation:

```zsh
tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

cat > "$tmp_file" <<'EOF'
body text with $literal values
EOF

gh pr create --draft --body-file "$tmp_file"
cmd_status=$?
exit "$cmd_status"
```

Multiple cleanup paths:

```zsh
tmp_body="$(mktemp)"
tmp_log="$(mktemp)"
cleanup() {
  rm -f "$tmp_body" "$tmp_log"
}
trap cleanup EXIT

some_command >"$tmp_log" 2>&1
cmd_status=$?
if [ "$cmd_status" -ne 0 ]; then
  sed -n '1,120p' "$tmp_log"
fi
exit "$cmd_status"
```

Optional search roots:

```zsh
roots=(README.md .github)
[ -e CONTRIBUTING.md ] && roots+=(CONTRIBUTING.md)
rg -n "pull request|commit|release" "${roots[@]}"
```

JSON filtering without nested quote escaping:

```zsh
workspace_id="wE"
herdr pane list |
  jq -r --arg workspace "$workspace_id" \
    '.result.panes[] | select(.workspace_id == $workspace) | [.pane_id, .cwd] | @tsv'
```

Looped probes with pipeline status:

```zsh
set +e
commands=(
  "bin/tool --help"
  "bin/tool subcommand extra"
)
for command_text in "${commands[@]}"; do
  printf '\n### %s\n' "$command_text"
  eval "$command_text" 2>&1 | sed -n '1,40p'
  cmd_status=${pipestatus[1]}
  printf 'exit=%s\n' "$cmd_status"
done
```

## Recovery

If a command already created the intended external effect before failing during
cleanup, verify the external state directly instead of rerunning the write. For
example, after `gh pr create` prints a URL and then zsh reports a wrapper error,
run `gh pr view <number> --json number,url,state,isDraft` before trying to
create another PR.
