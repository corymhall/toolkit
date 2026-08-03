---
name: triage-provider-issue
description: Triage Pulumi provider issues from evidence to disposition or next action. Use for initial issue assessment, uncertain ownership, duplicate decisions, or selecting a repro, lifecycle, parity, docs, or workaround specialist.
---

# Triage Provider Issue

Triage Pulumi provider issues as an evidence-driven routing problem. Identify the implementation boundary, gather direct source code evidence for root cause, determine settled vs. unsettled facts, estimate confidence, recommend repository labels, and define concrete maintainer steps.

> ⚠️ **Core Rule:** Do not post GitHub comments, apply labels, or close issues directly. Produce a bounded triage artifact containing root cause evidence, recommended labels, and concrete maintainer steps.

---

## Required Reference Files (MUST Read During Triage)

You **MUST** read the appropriate reference document before finalizing dispositions, assigning labels, or switching specialists:

| Reference File | When to Read | Key Purpose & Output |
| :--- | :--- | :--- |
| **[`references/disposition-gates.md`](references/disposition-gates.md)** | **Before recommending labels or final disposition** | Provides exact gate criteria for `awaiting-upstream`, `awaiting/bridge`, `duplicate`, `awaiting-feedback`, `local-fix`, and `fixed by upgrade`. |
| **[`references/provider-families.md`](references/provider-families.md)** | **During initial resource probe** | Defines subsystem boundaries. Direct source evidence can settle ownership without another repro. TF parity is conditional, not mandatory. |
| **[`references/helper-switches.md`](references/helper-switches.md)** | **When selecting a specialist skill** | Defines explicit trigger criteria for switching to `stage-pulumi-provider-repro`, `bridge-parity-investigation`, `pulumi-rpc-lifecycle-investigation`, etc. |
| **[`references/confidence-and-artifacts.md`](references/confidence-and-artifacts.md)** | **When calculating confidence score** | Enforces counterfactual discriminator test (`>=90%`, `60-89%`, `<60%`). |
| **[`references/workaround-investigation.md`](references/workaround-investigation.md)** | **When user needs temporary mitigation** | Defines 5-tier workaround search hierarchy & validation levels. |

---

## Triage Workflow & Evidence Rules

1. **Probe Repository Layout & Identify Boundary:** Probe effective modules, resource implementation, and provider family (see [`references/provider-families.md`](references/provider-families.md)).
2. **Gather Direct Source Evidence:** Inspect Go code, stack traces, AST parser logic, logs, or schema metadata first. **Direct source evidence can settle ownership directly without demanding another repro or Terraform test.**
3. **Establish Root Cause & Confidence:** Estimate confidence after evidence pass:
   - **$\ge$ 90% (Settled):** State provisional disposition, explain strongest root-cause evidence, name ruled-out alternatives, recommend repository labels, and define concrete maintainer next step.
   - **60% – 89% (Uncertain):** Center on the unresolved question. Stage the sharper discriminator (repro/parity test) before making a strong ownership call.
   - **$<$ 60% (Low):** Avoid leading hypotheses. Focus purely on gathering logs, layout probes, or search evidence.
4. **Discriminator Test:** Ask: *"Would the opposite repro, parity result, or ownership observation change my recommendation?"* If yes, routing is not settled.

---

## Specialist Capability Routing Matrix

Select a specialist explicitly when routing is not settled or when a specific evidence artifact is required (see [`references/helper-switches.md`](references/helper-switches.md)):

| Specialist Skill | When to Select | Primary Deliverable |
| :--- | :--- | :--- |
| **`stage-pulumi-provider-repro`** | Pulumi lifecycle (create/update/refresh/import) needs maintainer-quality test | Staged Pulumi repro harness & command matrix |
| **`stage-terraform-provider-repro`** | Terraform behavior is the decisive discriminator or upstream TF repro is needed | Staged HCL/TF acceptance test artifact |
| **`bridge-parity-investigation`** | Pulumi fails, Terraform succeeds, and the gap is at the bridge boundary | Focused bridge cross-test |
| **`pulumi-rpc-lifecycle-investigation`** | `grpc.json` log available; unexpected `Check`/`Diff`/`Read` ordering or payload bug | RPC Timeline & Layer Breakdown (Engine vs Bridge vs TF) |
| **`investigate-converted-provider-docs`** | Generated docs, examples, casing, or PCL conversion bugs | Converter pipeline triage (`tfgen` vs PCL vs HCL2) |
| **`workaround-investigation`** | Ownership is clear but user needs immediate mitigation | Documented user workaround & fallback |

---

## GitHub Search Hygiene

```bash
# Explicit repo search (issues / PRs)
gh search issues --repo owner/repo 'search terms' --json number,title,state,url --limit 20
gh search prs --repo owner/repo 'search terms' --json number,title,state,url,closedAt,updatedAt --limit 20
```

- **State Filter:** `--state` accepts `open` or `closed` (never `all`). Omit `--state` to search both.
- **Merge Metadata:** `gh search prs` does **not** expose `mergedAt`. Use `closedAt` then `gh pr view <PR> --json mergedAt`.

---

## Default Triage Output Template

Always output this compact triage artifact, prioritizing **Root Cause** and **Concrete Next Step**:

```markdown
## Triage Summary: Issue #<number>

- **Current State:** <Brief summary>
- **Likely Root Cause / Implementation Boundary:** <Direct source/log evidence supporting root cause and owning subsystem>
- **Concrete Next Step:** <Primary actionable maintainer step>
- **Confidence:** < >=90% / 60-89% / <60% >
- **Candidate Labels:** <Recommended disposition labels: awaiting-upstream, awaiting/bridge, duplicate, awaiting-feedback, local-fix, fixed by upgrade>
- **Settled Facts:** <What is proven by evidence>
- **Unsettled Questions:** <What remains unconfirmed>
- **Selected Specialist:** <Specialist skill name or None>
- **Workaround Status:** <Available mitigation or None>
- **Related Issues:** <Duplicates, same-family, or background issues>
```
