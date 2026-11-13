---
name: memory-guard
description: Use when a command is killed by memrun, exits 137, exceeds an RSS limit, or produces a memrun JSONL log; inspect the log, identify the largest process, preserve diagnostics, and choose the next safe step before rerunning.
---

# Memory Guard

Use this after `memrun` stops a command, or when the user mentions a memrun
JSONL log, RSS limit, exit `137`, or memory guard. The `make` proxy installed at
`~/.local/bin/make` guards commands in any harness. Logs default to
`${XDG_STATE_HOME:-~/.local/state}/toolkit/memrun/`.

## First Response

Do not immediately rerun the failed command. First inspect the log and explain:

- the original command and cwd;
- the configured memory limit, measurement metric, and sample threshold;
- the peak total memory and RSS;
- the largest process at peak or kill time;
- whether a macOS `sample` file was captured;
- the exact log path and any sample path.

Prefer the bundled summarizer at `scripts/summarize_memrun_log.py` relative to
this loaded `SKILL.md`:

```bash
python3 /absolute/path/to/memory-guard/scripts/summarize_memrun_log.py <memrun-log>.jsonl
```

When working from this toolkit checkout, the repo-relative source path is also
valid:

```bash
python3 skills/memory-guard/scripts/summarize_memrun_log.py <memrun-log>.jsonl
```

On macOS, `memrun` enforces the greater of RSS and physical footprint for each
process, including compressed memory that Activity Monitor counts but RSS
misses. Linux and unavailable native measurements fall back to RSS. The
`--rss-limit` and `MEMRUN_RSS_LIMIT` names remain for compatibility. New logs
retain RSS and record `physical_footprint`, `memory`, and `total_memory`
separately. Logs without an exit, kill, or interrupt record are incomplete, not
successful runs. Interruptions terminate the command group and are logged
explicitly.

## Recovery Rules

- Treat exit `137` from `memrun` as an intentional guard kill, not a normal test
  failure.
- Never rerun the original command unguarded.
- If rerunning is needed, keep `memrun` enabled and lower scope first: a
  narrower make target, one package, one test, or the direct generator command.
- If one child process dominates memory, focus on that binary, language host,
  compiler, or test process rather than the parent shell.
- If a sample exists, inspect the top stack frames before proposing code
  changes.
- If no sample exists, rerun with a lower `MEMRUN_SAMPLE_AT` and the same or
  lower `MEMRUN_RSS_LIMIT`.
- Preserve JSONL and sample paths in the final answer so the user can reuse
  them.

## Configuration

The runtime-neutral variables are:

- `MEMRUN_RSS_LIMIT`
- `MEMRUN_SAMPLE_AT`
- `MEMRUN_INTERVAL`
- `MEMRUN_LOG_DIR`
- `MEMRUN_LABEL`
- `MEMGUARD_DISABLE`

Legacy `CODEX_MEMRUN_*` and `CODEX_MEMGUARD_DISABLE` aliases remain supported.
The proxy only guards `make` resolved through `PATH`; an explicit executable
such as `/usr/bin/make` bypasses it.

```bash
MEMRUN_RSS_LIMIT=8g MEMRUN_SAMPLE_AT=5g make generate
MEMGUARD_DISABLE=1 make -n
```

Use `MEMGUARD_DISABLE=1` only for a harmless dry run or when the user explicitly
wants the guard bypassed.

## Output

Report the diagnosis first, then the safe next command. Keep the distinction
clear between what the log proves and what remains an inference.
