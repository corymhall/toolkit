#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
helper="${repo_root}/skills/claude-review/scripts/claude-review.mjs"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

mkdir -p "${tmp_dir}/bin" "${tmp_dir}/repo"
cat >"${tmp_dir}/bin/claude" <<'PY'
#!/usr/bin/env python3
import json
import os
import sys

with open(os.environ["CLAUDE_ARGS_FILE"], "w") as args_file:
    json.dump(sys.argv[1:], args_file)
print(json.dumps({
    "type": "result",
    "session_id": "00000000-0000-4000-8000-000000000000",
    "result": "fake review complete",
    "duration_ms": 1,
    "terminal_reason": "done",
}))
PY
chmod +x "${tmp_dir}/bin/claude"

git -C "${tmp_dir}/repo" init -q
git -C "${tmp_dir}/repo" config user.email test@example.com
git -C "${tmp_dir}/repo" config user.name Test
printf '%s\n' old >"${tmp_dir}/repo/file.txt"
git -C "${tmp_dir}/repo" add file.txt
git -C "${tmp_dir}/repo" commit -qm init
printf '%s\n' new >"${tmp_dir}/repo/file.txt"

(
  cd "${tmp_dir}/repo"
  PATH="${tmp_dir}/bin:${PATH}" \
  CLAUDE_ARGS_FILE="${tmp_dir}/args.json" \
    node "${helper}" --mode review >"${tmp_dir}/stdout" 2>"${tmp_dir}/stderr"
)
grep -q '^fake review complete$' "${tmp_dir}/stdout"

python3 - "${tmp_dir}/args.json" <<'PY'
import json
import pathlib
import sys

args = json.loads(pathlib.Path(sys.argv[1]).read_text())
if args[args.index("--permission-mode") + 1] != "plan":
    raise SystemExit("Claude review did not use plan permission mode")
if args[args.index("--tools") + 1] != "Read,Glob,Grep,LS":
    raise SystemExit("Claude review did not restrict the available tool set")
if "--allowedTools" in args:
    raise SystemExit("Claude review still uses pre-approval instead of tool restriction")
PY

echo "Claude review helper tests passed."
