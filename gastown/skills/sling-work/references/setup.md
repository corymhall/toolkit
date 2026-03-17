# Setup Reference

## TOC

1. Classify the launch
2. Check visibility constraints
3. Launch discipline
4. Command shapes

## 1. Classify the launch

Pick one:

- `monitor-to-completion`
- `dispatch-and-return-later`

Use monitor mode when the result is needed in the current session.

Use dispatch-later mode when the work should start now but does not block the
current session.

## 2. Check visibility constraints

Fresh slung workers do not automatically share this session's dirty workspace
state.

Before launch, decide whether the worker needs:

- pushed branch state
- shared artifact files
- or only the hooked instruction payload

If the worker must inspect exact current code or docs, materialize that state
first. Typical options:

- commit + push the branch
- copy review/input artifacts into a shared `.runtime/...` directory
- attach the needed context directly in the sling message/vars when small

Do not sling against parent-only local state and assume the worker can see it.

## 3. Launch discipline

Prefer:

- explicit distinct worker targets when multiple sidecars will run in parallel
- or sequential launch with confirmation between launches

Avoid racing two slings onto the same idle worker.

Record at launch time:

- target worker or rig
- expected output location
- terminal condition

## 4. Command shapes

Review/report-style sidecar:

```bash
gt sling <worker-formula> <target> --agent <agent> --var ...
```

Work dispatch:

```bash
gt sling <bead-id> <rig> [flags...]
```

If the message is important to later monitoring, record it in a durable place
such as bead notes or the session ledger before moving on.
