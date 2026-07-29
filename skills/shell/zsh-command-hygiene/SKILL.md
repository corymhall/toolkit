---
name: zsh-command-hygiene
description: "Use when writing or repairing multi-line zsh shell commands, especially commands that create temp files, preserve exit statuses, parse JSON through shell pipelines, run cleanup, combine GitHub CLI calls with heredocs, or fail with zsh reserved-parameter errors such as `read-only variable: status`."
---

# Zsh Command Hygiene

Guidelines and safe patterns for multi-line zsh commands, status preservation, and clean subshell execution.

---

## Anti-Pattern vs. Safe Pattern Quick Reference

| Dangerous Anti-Pattern | Safe Alternative | Reason |
| :--- | :--- | :--- |
| `status=$?` or `status=${pipestatus[1]}` | `cmd_status=$?` or `cmd_status=${pipestatus[1]}` | `status` is a read-only reserved variable in Zsh. |
| `python3 -c "import json; print(d[\"key\"])"` | `jq -r --arg k "key" '.[$k]'` or heredoc | Prevents nested backslash quote-escaping bugs. |
| Manual `rm "$tmp"` after command execution | `tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT` | Guarantees temp cleanup without clobbering exit status `$?`. |
| Unquoted heredoc `cat <<EOF` containing `$` | `cat <<'EOF'` (single-quoted marker) | Prevents unintended shell variable expansion inside heredoc. |
| `rg "pattern" non_existent_file.md` | `[ -e file.md ] && roots+=(file.md)` | Prevents `ripgrep` from failing due to missing positional args. |

---

## Reserved Zsh Variables (DO NOT ASSIGN)

Never assign to these Zsh special parameters:
`status`, `pipestatus`, `signals`, `options`, `path`, `fpath`, `argv`, `ARGC`, `RANDOM`, `SECONDS`.

---

## Copy-Pasteable Safe Patterns

### 1. Temp File Cleanup & Status Preservation

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

### 2. Multi-File Cleanup with Log Capture

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

### 3. Safe Pipeline Status Capture (`pipestatus`)

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

---

## Recovery Checklist

- [ ] **Check Side Effects First:** If a command fails during cleanup after creating an external resource (e.g. `gh pr create` printed a URL then wrapper errored), verify state with `gh pr view <number>` before rerunning the write command.
