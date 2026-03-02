# Setup and Dispatch Reference

## TOC

1. Setup steps
2. Dispatch steps
3. Merge-gate criteria
4. Dispatch mode notes

## 1. Setup steps

### 1.1 Reuse staged convoy if present

```bash
gt convoy list --all --json
```

If a staged convoy already tracks this epic, reuse it. Do not create duplicates.

### 1.2 Ensure bead type is epic

```bash
bd show <epic-id> --json | python3 -c "import json,sys; d=json.load(sys.stdin)[0]; print(d['issue_type'])"
# If not epic:
bd update <epic-id> -t epic
```

### 1.3 Create or verify integration branch

```bash
gt mq integration status <epic-id>
# If missing:
gt mq integration create <epic-id>
```

Record integration branch name for gate execution later.

### 1.4 Gather implementable leaves

```bash
bd list --parent <epic-id> --all --limit 0 --json
```

Include types: `task`, `bug`, `feature`, `chore`.
Exclude type: `epic`.

### 1.5 Stage convoy as tracker only

```bash
gt convoy stage <epic-id> --json
```

Record convoy ID. Keep convoy staged for full workflow lifetime.

Important:
- Do not launch this convoy.
- Do not sling convoy ID.
- Convoy may contain already-closed leaves; account for this when reading progress.

## 2. Dispatch steps

### 2.1 Check capacity

```bash
gt rig config show <rig>
```

Read `max_polecats`. This limit includes refinery-spawned polecats.

### 2.2 Find ready leaves

```bash
bd ready --parent <epic-id> --json
```

Filter output before slinging:
- Keep only `task`, `bug`, `feature`, `chore`.
- Confirm each ID is part of this epic tree.
- Treat `bd ready` as authoritative when dependencies are modeled with `merge-blocks`.

### 2.3 Apply merge gate

Default flow:
- If dependency modeling is migrated (`merge-blocks` used for code-order deps), no per-candidate merge-proof check is required.
- If the tree is still legacy (`blocks` used for code-order deps), use manual merge-proof checks before sling.

Legacy-check commands:

```bash
gt mq integration status <epic-id>
gt mq list <rig> --epic <epic-id> --json
```

### 2.4 Manual sling

```bash
gt sling <leaf-1> <rig> --no-convoy
gt sling <leaf-2> <rig> --no-convoy
# repeat for eligible leaves only
```

Always keep `--no-convoy` here. Auto-convoy discovery can create unwanted extra convoys while tracker convoy remains staged.

Compatibility fallback (only for known formula/wisp mismatch failures):

If sling fails with errors indicating `bd mol wisp` rejected `--root-only`, retry once with raw-hook mode:

```bash
gt sling <leaf> <rig> --no-convoy --hook-raw-bead
```

Guardrails:
- Use this fallback only for the `--root-only`/wisp compatibility failure class.
- Do not switch to raw-hook mode for unrelated errors (dependency gate, spawn capacity, routing, etc.).
- Keep `--no-convoy` on the fallback retry.

## 3. Dependency gating criteria

Default policy:
- Use `merge-blocks` for code-order dependencies.
- Keep `blocks` for non-merge sequencing dependencies.

Commands:

```bash
# Add merge-gated dependency (preferred for code-order deps)
bd dep add <blocked-id> <blocker-id> --type merge-blocks

# Convert legacy blocks dep to merge-blocks
bd dep remove <blocked-id> <blocker-id>
bd dep add <blocked-id> <blocker-id> --type merge-blocks
```

With `merge-blocks` in place, `bd ready` is the main dispatch gate.
Do not require per-candidate MR proof checks in normal flow.

Legacy fallback (only when dependency model has not been migrated):
- Dependency bead closed? Nice to know, not sufficient.
- Dependency MR merged into integration branch? Required.
- Queue still pending refinery work for dependency? Not ready.

If any dependency fails the checklist, do not sling the dependent leaf yet.

## 4. Dispatch mode notes

`gt sling` behavior depends on scheduler mode:
- Direct mode (`scheduler.max_polecats <= 0`): immediate spawn + hook.
- Deferred mode (`scheduler.max_polecats > 0`): enqueue now, scheduler dispatch later.

This workflow still uses staged convoy tracker + manual per-leaf sling in both modes.
