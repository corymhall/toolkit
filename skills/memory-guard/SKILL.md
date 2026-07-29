---
name: memory-guard
description: Use when a command is killed by memrun, exits 137, exceeds an RSS limit, or produces a memrun JSONL log; inspect the log, identify the largest process, preserve diagnostics, and choose the next safe step before rerunning.
---

# Memory Guard

Diagnose and recover from `memrun` memory limit kills (exit 137, RSS limit exceedance, or JSONL log output).

> ⚠️ **Core Rule:** Exit `137` from `memrun` is an intentional memory limit kill, **not** an ordinary test/build failure. **Never rerun an unguarded command.**

---

## Diagnostic Pipeline

Do not immediately rerun the failed command. First execute this 3-step diagnosis:

### 1. Run Log Summarizer
Execute the bundled Python summarizer against the JSONL log (found in `${XDG_STATE_HOME:-~/.local/state}/toolkit/memrun/`):

```bash
python3 "$SKILL_DIR/scripts/summarize_memrun_log.py" <path-to-memrun-log>.jsonl
```

### 2. Extract Key Metrics
Report these 6 facts in your initial diagnosis:
1. Original command and CWD.
2. Hard RSS limit (`MEMRUN_RSS_LIMIT`) and sample threshold (`MEMRUN_SAMPLE_AT`).
3. Peak total RSS reached.
4. Dominant process name/PID at kill time.
5. macOS `sample` file capture status.
6. Exact log and sample file paths.

### 3. Inspect Stack Traces (If Available)
If a macOS `sample` file was captured, inspect top stack frames before proposing code/generator changes.

---

## Environment Variables & Configuration

| Variable | Default / Purpose | Example Usage |
| :--- | :--- | :--- |
| **`MEMRUN_RSS_LIMIT`** | Hard RSS limit triggering kill | `MEMRUN_RSS_LIMIT=8g make generate` |
| **`MEMRUN_SAMPLE_AT`** | RSS threshold triggering macOS `sample` capture | `MEMRUN_SAMPLE_AT=5g make generate` |
| **`MEMRUN_INTERVAL`** | RSS polling frequency | `MEMRUN_INTERVAL=200ms` |
| **`MEMRUN_LOG_DIR`** | Output directory for JSONL logs | `${XDG_STATE_HOME:-~/.local/state}/toolkit/memrun/` |
| **`MEMGUARD_DISABLE`** | Disable memory proxy (`1` to disable) | `MEMGUARD_DISABLE=1 make -n` *(Dry-run only)* |

---

## Recovery Checklist

- [ ] **Do Not Rerun Unguarded:** Never rerun the full command without scoping or limits.
- [ ] **Narrow Command Scope:** Scope down to a smaller package, single test, or direct generator invocation.
- [ ] **Focus on Dominant Process:** If a child compiler or test binary dominates RSS, target that specific binary rather than parent shell scripts.
- [ ] **Adjust Sample Threshold:** If no sample was captured, rerun with a lower `MEMRUN_SAMPLE_AT` and identical `MEMRUN_RSS_LIMIT`.
- [ ] **Preserve Log Paths:** Include exact JSONL and sample file paths in final chat responses for user reference.
