---
name: pulumi-rpc-lifecycle-investigation
description: "Investigate Pulumi engine, bridge, and provider lifecycle behavior from gRPC logs, architecture docs, and provider code. Use when diagnosing confusing Pulumi preview/update/refresh/import/replacement behavior, bridged provider failures, unexpected Check/Diff/Read ordering, provider upgrade regressions, stale or surprising inputs/state, Terraform bridge translation issues, or questions about which layer owns a lifecycle bug."
---

# Pulumi RPC Lifecycle Investigation

Reconstruct the actual Pulumi RPC conversation before assigning ownership.
Treat engine, bridge, Pulumi provider, and upstream Terraform provider behavior
as separate layers until the evidence shows how a value or decision moved
between them.

Prefer this skill when the question is about lifecycle semantics or ownership
from logs. Use `stage-pulumi-provider-repro`, `stage-terraform-provider-repro`,
or `bridge-parity-investigation` when the next best action is a durable repro or
bridge cross-test artifact.

## Get Evidence First

If a gRPC log is not already available, ask the user to reproduce with:

```sh
PULUMI_DEBUG_GRPC=grpc.json pulumi <operation> ...
```

Use any explicit log path from the user. If none is provided, lightly search the
workspace for likely files such as `grpc.json`, `*.grpc.json`, or
`debug-grpc*.json`; do not assume any repo-specific debug folder.

Capture the exact operation and context:

- Pulumi command and flags, especially `--refresh`, `--run-program`,
  `--preview-only`, import, destroy, or replacement-related options.
- Provider name and versions, old and new if this is an upgrade.
- Resource URN/type/name and the specific property or lifecycle decision under
  investigation.
- Whether the failure occurred during preview, update execution, refresh,
  import, read, replacement planning, or destroy.

## Lifecycle Docs

Use the Pulumi architecture docs as the stable lifecycle reference, but prefer
their Markdown source for search and selective reading.

Context-efficient source order:

1. If a local `pulumi/pulumi` checkout is available, search the Markdown source
   with `rg` under `docs/architecture/` and read only the relevant file.
2. Otherwise, use GitHub code search against `pulumi/pulumi` to locate the
   source path, then fetch only that Markdown file.
3. Use the rendered ReadTheDocs pages only as a fallback or as stable final
   links when citing docs.

Useful source paths:

- Overview: `pulumi/pulumi:docs/architecture/README.md`
- Resource registration:
  `pulumi/pulumi:docs/architecture/deployment-execution/resource-registration.md`
- Provider implementer guide:
  `pulumi/pulumi:docs/architecture/providers/implementers-guide.md`

Useful commands:

```sh
gh search code "RegisterResourceRequest path:docs/architecture" --repo pulumi/pulumi --limit 10 --json path,url
gh api repos/pulumi/pulumi/contents/docs/architecture/deployment-execution/resource-registration.md --jq '.content' | base64 -d | rg -n "Read|Diff|oldInputs|refresh"
gh api repos/pulumi/pulumi/contents/docs/architecture/providers/implementers-guide.md --jq '.content' | base64 -d | rg -n "Check|Diff|Read|Update"
```

Rendered links for final citations or fallback:

- `https://pulumi-developer-docs.readthedocs.io/latest/docs/architecture/README.html`
- `https://pulumi-developer-docs.readthedocs.io/latest/docs/architecture/deployment-execution/resource-registration.html`
- `https://pulumi-developer-docs.readthedocs.io/latest/docs/architecture/providers/implementers-guide.html`

Verify lifecycle assumptions against docs before naming an owner.

## Build An RPC Timeline

Parse only the relevant resource/provider calls, in order. For each relevant
URN, collect:

- Language host to engine: `RegisterResource.request.object`, dependencies,
  options, version, aliases, import ID, additional secret outputs.
- Provider config: `CheckConfig`, `Configure`, provider inputs.
- Resource validation: `Check.request.olds`, `Check.request.news`,
  `Check.response.inputs`, failures.
- Refresh/read: `Read.request.properties`, `Read.request.inputs`,
  `Read.response.properties`, `Read.response.inputs`.
- Diff: `Diff.request.olds`, `Diff.request.oldInputs`, `Diff.request.news`,
  ignore changes, response changes/detailed diff/errors.
- Execution: `Create`, `Update`, `Delete`, `Invoke`, or provider-specific
  calls if reached.

Do not summarize the whole log when one property or one operation explains the
failure. Trace the smallest useful path.

## Interpret Common Lifecycles

Normal update:

1. Program registers desired inputs.
2. Engine calls provider `Check` with old checked inputs and new program
   inputs.
3. Engine calls provider `Diff` with old state and checked new inputs.
4. Engine calls `Update` or returns no-op.

Refresh:

1. Engine calls provider `Read` with checkpoint inputs and state.
2. `Read` returns refreshed candidate state and candidate inputs.
3. Engine calls provider `Diff` with refreshed candidate as `olds`/`oldInputs`
   and pre-refresh checkpoint inputs as `news`.
4. This polarity is intentional. Do not treat refresh `news` as necessarily
   coming from the current program.

Import/read:

- Distinguish managed refresh `Read` from external get/import reads.
- Check whether state, inputs, or only an ID was supplied.

Replacement:

- Watch for a second `Check` without old inputs during replacement planning.
- Separate replacement planning from create-before-delete/delete-before-replace
  execution.

Unknowns and dependencies:

- Track unknown values, dependency substitution, and ignoreChanges
  preprocessing separately from provider defaults.

## Trace Values By Source

For the failing property or decision, classify each observed value by source:

- User program input from `RegisterResource.request.object`.
- Checked input from `Check.response.inputs`.
- Prior checkpoint input from `Check.request.olds`, `Read.request.inputs`, or
  refresh `Diff.news`.
- Refreshed candidate input/state from `Read.response.inputs/properties`.
- Provider default or autonaming output from `Check`.
- Bridge translation artifact from Pulumi-to-Terraform config/state conversion.
- Terraform provider behavior from state upgraders, `CustomizeDiff`, plan
  modifiers, schema defaults, validators, or CRUD.

Guardrails:

- A value in `__defaults` proves it was stored as a Pulumi default in that
  input bag; it does not prove the current provider schema still has that
  default.
- A value in refresh `Diff.news` may be a pre-refresh checkpoint input, not the
  current program input.
- A value returned by `Read` can be actual cloud state, provider reconstruction,
  bridge extraction from outputs, or state-upgrader output. Inspect the
  provider/bridge path before assuming which.
- Do not infer a bridge bug just because Terraform `CustomizeDiff` fails. First
  identify the raw config/state Terraform received.

## Separate Layers

When reporting, use this ownership breakdown:

- Engine: operation scheduling, refresh polarity, checkpoint selection,
  dependency graph, unknowns, ignoreChanges, replacement orchestration.
- Bridge: Pulumi RPC to Terraform config/state translation, checked
  input/default handling, state upgrade invocation, raw config construction,
  diff/detail adaptation, provider callbacks.
- Provider: Pulumi provider metadata, callbacks, schema overlays, local patches,
  generated SDK shape.
- Upstream Terraform provider: Terraform schema, state upgraders, validators,
  customize diff, plan modifiers, CRUD implementation.

State what each layer did with direct evidence. If attribution is not proven,
say what remains unknown.

## Suggested Output

Use this structure for non-trivial investigations:

```md
## Lifecycle Phase
<preview/update/refresh/import/replacement and why>

## RPC Timeline
1. <method> <important value/decision>
2. ...

## Property Trace
| Step | Payload | Value | Interpretation |
|---|---|---|---|

## Layer Assessment
Engine:
Bridge:
Provider:
Upstream Terraform:

## Likely Root Cause
<what the evidence supports>

## Unknowns
<what is not yet proven>

## Next Checks
<specific code paths, logs, or repros to inspect>
```

For short answers, keep the same discipline without the full table: cite the
exact RPC payloads that prove the conclusion.
