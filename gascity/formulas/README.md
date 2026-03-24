# Gas City Formulas

This directory contains the current canonical formula subset for the local
Gas City flow in this repo.

## Current Canonical Set

Workflows:

- `delivery-workflow-planned` — two-session convoy-first delivery
- `delivery-workflow-quick` — one-session convoy-first delivery

Shared expansions:

- `bootstrap-expansion`
- `draft-spec-expansion`
- `enrich-expansion`
- `plan-expansion`
- `execution-beads-expansion`
- `review-lane-expansion`
- `verify-finalize-expansion`

## What Is Intentionally Not Here

The following were removed from this namespace because they still encoded older
GT-era assumptions and were not yet updated to the canonical convoy-first flow:

- router / umbrella workflow formulas
- GT-style final-review launch and monitoring formulas
- the old implementation review worker formula
- decomposition / beadify formulas that still depended on the older model

Those legacy or compatibility surfaces may still exist under `gastown/`.

## Current Shape

The canonical path today is:

```text
bootstrap
  -> draft spec
  -> enrich
  -> planned or quick workflow
  -> convoy-first execution / verification
```

Planned delivery:

```text
discovery scope -> planning scope -> execution beads -> owned execution convoy
```

Quick delivery:

```text
spec -> enrich -> one-session implementation -> convoy-aware finalize
```

## Templates

These formulas use the shared templates under:

- [spec.md](/Users/chall/gt/toolkit/crew/quick/gascity/docs/templates/spec.md)
- [plans.md](/Users/chall/gt/toolkit/crew/quick/gascity/docs/templates/plans.md)
- [plan-draft.md](/Users/chall/gt/toolkit/crew/quick/gascity/docs/templates/plan-draft.md)

## Validation

When editing this directory, at minimum validate with:

```bash
TMP=$(mktemp -d)
mkdir -p "$TMP/.beads"
ln -s "$PWD/gascity/formulas" "$TMP/.beads/formulas"
(cd "$TMP" && gc formula show delivery-workflow-planned --var feature=test --var brief='test')
(cd "$TMP" && gc formula show delivery-workflow-quick --var feature=test --var brief='test')
rm -rf "$TMP"
```
