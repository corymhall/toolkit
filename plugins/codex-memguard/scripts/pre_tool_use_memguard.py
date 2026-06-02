#!/usr/bin/env python3
import json
import os
import re
import shlex
import sys


SCRIPT_DIR = os.path.dirname(os.path.realpath(__file__))
PLUGIN_ROOT = os.environ.get("PLUGIN_ROOT") or os.path.dirname(SCRIPT_DIR)
MEMRUN = os.path.join(PLUGIN_ROOT, "scripts", "memrun")
SHELL = "/bin/zsh"
MAKE_COMMAND_RE = re.compile(
    r"(^|[;&|\n]\s*)(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(?:[^\s;&|]*/)?make(?:\s|$)"
)
MISE_EXEC_MAKE_RE = re.compile(r"(^|[;&|\n]\s*)mise\s+exec\b[^;&|\n]*\s--\s+(?:[^\s;&|]*/)?make(?:\s|$)")


def contains_make(command: str) -> bool:
    return bool(MAKE_COMMAND_RE.search(command) or MISE_EXEC_MAKE_RE.search(command))


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command")
    if not isinstance(command, str) or not command.strip():
        return 0

    if (
        "CODEX_MEMGUARD_DISABLE=1" in command
        or "CODEX_MEMRUN_ACTIVE=1" in command
        or "memrun" in command
        or not contains_make(command)
    ):
        return 0

    updated = f"{shlex.quote(MEMRUN)} --label codex-bash -- {SHELL} -lc {shlex.quote(command)}"
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "updatedInput": {
                **tool_input,
                "command": updated,
            },
        }
    }
    json.dump(output, sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
