#!/usr/bin/env bash
set -euo pipefail

# These tests exercise their own proxy, even when validation itself is guarded.
unset MEMGUARD_DISABLE CODEX_MEMGUARD_DISABLE PI_MEMGUARD_DISABLE MEMRUN_ACTIVE CODEX_MEMRUN_ACTIVE

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
skill_dir="${repo_root}/skills/memory-guard"
proxy="${skill_dir}/scripts/make"
memrun="${skill_dir}/scripts/memrun"
summarizer="${skill_dir}/scripts/summarize_memrun_log.py"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

mkdir -p "${tmp_dir}/proxy-bin" "${tmp_dir}/real-bin" "${tmp_dir}/state"
ln -s "${proxy}" "${tmp_dir}/proxy-bin/make"
cat >"${tmp_dir}/real-bin/make" <<'SH'
#!/usr/bin/env bash
printf 'arg=%s\n' "$@"
printf 'active=%s\n' "${MEMRUN_ACTIVE:-0}"
exit "${FAKE_MAKE_EXIT:-0}"
SH
chmod +x "${tmp_dir}/real-bin/make"

test_path="${tmp_dir}/proxy-bin:${tmp_dir}/real-bin:/usr/bin:/bin"
set +e
XDG_STATE_HOME="${tmp_dir}/state" FAKE_MAKE_EXIT=23 PATH="${test_path}" \
  "${tmp_dir}/proxy-bin/make" alpha "two words" \
  >"${tmp_dir}/proxy.out" 2>"${tmp_dir}/proxy.err"
proxy_status=$?
set -e
[[ "${proxy_status}" -eq 23 ]]
grep -q '^arg=alpha$' "${tmp_dir}/proxy.out"
grep -q '^arg=two words$' "${tmp_dir}/proxy.out"
grep -q '^active=1$' "${tmp_dir}/proxy.out"
proxy_log=$(find "${tmp_dir}/state/toolkit/memrun" -name '*.jsonl' -print -quit)
[[ -n "${proxy_log}" ]]
python3 "${summarizer}" "${proxy_log}" >"${tmp_dir}/proxy-summary.out"
grep -q '^returncode: 23$' "${tmp_dir}/proxy-summary.out"

for bypass in \
  MEMGUARD_DISABLE \
  CODEX_MEMGUARD_DISABLE \
  PI_MEMGUARD_DISABLE \
  MEMRUN_ACTIVE \
  CODEX_MEMRUN_ACTIVE; do
  before=$(find "${tmp_dir}/state/toolkit/memrun" -name '*.jsonl' | wc -l | tr -d ' ')
  env "${bypass}=1" XDG_STATE_HOME="${tmp_dir}/state" PATH="${test_path}" \
    "${tmp_dir}/proxy-bin/make" bypass >"${tmp_dir}/${bypass}.out" 2>"${tmp_dir}/${bypass}.err"
  after=$(find "${tmp_dir}/state/toolkit/memrun" -name '*.jsonl' | wc -l | tr -d ' ')
  [[ "${before}" == "${after}" ]]
  [[ ! -s "${tmp_dir}/${bypass}.err" ]]
done

set +e
XDG_STATE_HOME="${tmp_dir}/kill-state" "${memrun}" \
  --rss-limit 20m --sample-at 30m --interval 0.05 -- \
  python3 -c 'import time; data = bytearray(80 * 1024 * 1024); time.sleep(5)' \
  >"${tmp_dir}/kill.out" 2>"${tmp_dir}/kill.err"
kill_status=$?
set -e
[[ "${kill_status}" -eq 137 ]]
kill_log=$(find "${tmp_dir}/kill-state/toolkit/memrun" -name '*.jsonl' -print -quit)
[[ -n "${kill_log}" ]]
python3 "${summarizer}" "${kill_log}" >"${tmp_dir}/kill-summary.out"
grep -q '^outcome: killed$' "${tmp_dir}/kill-summary.out"
grep -q 'memrun: killing' "${tmp_dir}/kill.err"

python3 "${skill_dir}/scripts/test_memrun.py"

echo "Memory guard tests passed."
