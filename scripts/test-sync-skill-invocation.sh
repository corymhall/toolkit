#!/bin/sh
set -eu

repo_root="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT HUP INT TERM

mkdir -p \
  "$temporary/skills/enabled/agents" \
  "$temporary/codex-skills" \
  "$temporary/.agents/skills/remote" \
  "$temporary/.agents/skills/codex-only"

cat > "$temporary/skills/enabled/SKILL.md" <<'EOF'
---
name: enabled
description: An enabled test skill.
disable-model-invocation: false
---

# Enabled
EOF
cat > "$temporary/skills/enabled/agents/openai.yaml" <<'EOF'
interface:
  display_name: Enabled
policy:
  allow_implicit_invocation: false
EOF
cat > "$temporary/.agents/skills/remote/SKILL.md" <<'EOF'
---
name: remote
description: A remote explicit-only test skill.
---

# Remote
EOF
cat > "$temporary/.agents/skills/codex-only/SKILL.md" <<'EOF'
---
name: codex-only
description: A test skill disabled only in Codex.
---

# Codex only
EOF
cat > "$temporary/skill-invocation.yaml" <<'EOF'
version: 1
skills:
  codex-only:
    model_invocable: true
    codex_model_invocable: false
    openai:
      interface:
        display_name: Codex only
        short_description: Codex override test skill
        default_prompt: Use $codex-only for the test.
  enabled:
    model_invocable: true
  remote:
    model_invocable: false
    openai:
      interface:
        display_name: Remote
        short_description: Remote test skill
        default_prompt: Use $remote for the test.
EOF

sync_command="${repo_root}/scripts/sync-skill-invocation.py"
uv run --script "$sync_command" --root "$temporary"

if grep -q '^disable-model-invocation:' "$temporary/skills/enabled/SKILL.md"; then
  echo "expected enabled Pi metadata to use the default" >&2
  exit 1
fi
if grep -q '^  allow_implicit_invocation:' \
  "$temporary/skills/enabled/agents/openai.yaml"; then
  echo "expected enabled Codex metadata to use the default" >&2
  exit 1
fi
grep -q '^disable-model-invocation: true$' \
  "$temporary/.agents/skills/remote/SKILL.md"
grep -q '^  display_name: Remote$' \
  "$temporary/.agents/skills/remote/agents/openai.yaml"
grep -q '^  allow_implicit_invocation: false$' \
  "$temporary/.agents/skills/remote/agents/openai.yaml"
if grep -q '^disable-model-invocation:' \
  "$temporary/.agents/skills/codex-only/SKILL.md"; then
  echo "expected the Codex-only override to remain enabled in Pi" >&2
  exit 1
fi
grep -q '^  allow_implicit_invocation: false$' \
  "$temporary/.agents/skills/codex-only/agents/openai.yaml"
uv run --script "$sync_command" --root "$temporary" --check

python3 - "$temporary/.agents/skills/remote/agents/openai.yaml" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
path.write_text(
    path.read_text(encoding="utf-8").replace(
        "allow_implicit_invocation: false", "allow_implicit_invocation: true"
    ),
    encoding="utf-8",
)
PY
if uv run --script "$sync_command" --root "$temporary" --check 2>/dev/null; then
  echo "expected stale invocation metadata to fail validation" >&2
  exit 1
fi

mkdir -p "$temporary/skills/unconfigured"
cat > "$temporary/skills/unconfigured/SKILL.md" <<'EOF'
---
name: unconfigured
description: A skill omitted from policy.
---

# Unconfigured
EOF
if uv run --script "$sync_command" --root "$temporary" --check 2>/dev/null; then
  echo "expected a skill missing from policy to fail validation" >&2
  exit 1
fi

echo "Skill invocation synchronization tests passed."
