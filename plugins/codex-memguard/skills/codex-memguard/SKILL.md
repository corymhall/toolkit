---
name: codex-memguard
description: Use when a command is killed by memrun, exits 137, exceeds an RSS limit, mentions Codex memory guard, or produces a ~/.codex/memrun JSONL log; inspect the log, identify the largest process, preserve diagnostics, and choose the next safe debug step before rerunning.
---

# Codex Memguard

Use this after `memrun` stops a command, or when the user mentions a
`~/.codex/memrun/*.jsonl` log, RSS limit, exit `137`, or memory guard.

## First Response

Do not immediately rerun the failed command. First inspect the log and explain:

- the original command and cwd;
- the hard RSS limit and sample threshold;
- the peak total RSS;
- the largest process at peak or kill time;
- whether a macOS `sample` file was captured;
- the exact log path and any sample path.

Prefer the bundled summarizer:

```bash
python3 "$PLUGIN_ROOT/scripts/summarize_memrun_log.py" ~/.codex/memrun/<log>.jsonl
```

If `PLUGIN_ROOT` is unavailable because the skill is being used from source,
run the script from this plugin directory:

```bash
python3 plugins/codex-memguard/scripts/summarize_memrun_log.py ~/.codex/memrun/<log>.jsonl
```

## Recovery Rules

- Treat exit `137` from `memrun` as an intentional guard kill, not a normal test
  failure.
- Never rerun the original command unguarded.
- If rerunning is needed, keep `memrun` enabled and lower scope first: a
  narrower make target, one package, one test, or the direct generator command.
- If the log shows one child process dominating RSS, focus on that binary,
  language host, compiler, or test process rather than the parent shell.
- If a sample file exists, inspect the top stack frames before proposing code
  changes.
- If no sample exists, rerun with a lower `CODEX_MEMRUN_SAMPLE_AT` and the same
  or lower `CODEX_MEMRUN_RSS_LIMIT`.
- Preserve the JSONL log and sample paths in the final answer so the user can
  reuse them.

## Useful Commands

```bash
memrun --rss-limit 8g --sample-at 5g -- make generate
CODEX_MEMRUN_RSS_LIMIT=8g CODEX_MEMRUN_SAMPLE_AT=5g make generate
CODEX_MEMGUARD_DISABLE=1 /usr/bin/make -n
```

Use `CODEX_MEMGUARD_DISABLE=1` only for a harmless dry run or when the user
explicitly wants the guard bypassed.

## Output

Report the diagnosis first, then the safe next command. Keep the distinction
clear between what the log proves and what is still an inference.
