---
name: pulumi-test-rationalization-audit
description: Audit and rationalize Go-heavy Pulumi provider or component test suites by producing a row-level inventory, provenance scan, ownership analysis, and decision-bucket report. Use when working in Pulumi bridged providers, native providers, or component libraries and you need to classify expensive, legacy, example, integration, or regression tests into keep, remove, rewrite-cheaper, move-upstream, conditional-run, or always-run buckets.
disable-model-invocation: true
---

# Pulumi Test Rationalization Audit

Collaborative audit methodology for Pulumi test suites (bridged providers, native providers, and component libraries). Automate discovery and git/PR provenance with bundled Python scripts; maintain judgments in handwritten metadata.

---

## Audit Execution Pipeline

| Step | Objective | Script / Command | Output Artifact |
| :--- | :--- | :--- | :--- |
| **1. Init Workspace** | Bootstrap audit directory | `python3 "$SKILL_DIR/scripts/init_audit_files.py" <audit-dir> --profile <profile> --repo <repo> --test-root <dir>` | `repo-audit.yaml`<br>`audit-metadata.yaml` |
| **2. Discover Tests** | Machine-readable inventory | `python3 "$SKILL_DIR/scripts/discover_go_tests.py" <test-root> --output <audit-dir>/discovered-tests.json` | `discovered-tests.json` |
| **3. Build Provenance** | Traces commits (`git log`) & PRs (`gh api`) | `python3 "$SKILL_DIR/scripts/build_go_test_provenance.py" all <audit-dir>/repo-audit.yaml --repo-root <repo-root>` | `test-provenance.json` |
| **4. Family Review** | Fill row metadata & dispositions | `python3 "$SKILL_DIR/scripts/scaffold_test_review.py" <test-name>` | Metadata updates |
| **5. Render Report** | Generate Markdown summary | `python3 "$SKILL_DIR/scripts/render_test_report.py" <audit-dir>/repo-audit.yaml <audit-dir>/audit-metadata.yaml` | `TEST_PROVENANCE.md` |
| **6. Validate** | Confirm zero missing fields | `python3 "$SKILL_DIR/scripts/validate_audit.py" <audit-dir>/repo-audit.yaml <audit-dir>/audit-metadata.yaml --mode progress` | Audit validation check |

---

## Core Protocol: 6 Diagnostic Questions

Ask these 6 questions for every test before deciding a disposition:

1. **Behavior:** What exact behavior is this test protecting?
2. **Ownership:** Is that behavior local to this repository, or owned elsewhere (e.g. upstream Terraform provider, CloudControl spec, engine)?
3. **Relevance:** Does the original fix, patch, or workaround still exist in the codebase today?
4. **Efficiency:** Is this the cheapest useful test shape for that behavior?
5. **Replacement:** If not, where should replacement coverage live?
6. **Cadence:** Should this test run `Always`, `Conditionally` (PR/Release), or `Do Not Run`?

---

## Repo Profiles & Ownership Models

- **`bridged-provider`** (e.g., `pulumi-aws`): Upstream Terraform bridge. Many tests belong upstream in Terraform provider or bridge SDK.
- **`native-provider`** (e.g., `pulumi-aws-native`): Cloud Control projection. Most tests remain local because there is no bridge bucket.
- **`component-library`** (e.g., `pulumi-awsx`): Multi-resource abstraction. Ownership stays in local component logic, provider defaults, or runtime ergonomics.

---

## Decision Buckets & Dispositions

### Report Decision Buckets
- `Tests We Can Remove`
- `Rewrite Cheaper`
- `Ready To Move Upstream`
- `Keep - Conditionally`
- `Keep - Always Run`
- `Still Needs Analysis`

### Row-Level Dispositions
`Keep`, `Delete candidate`, `Covered upstream`, `Move upstream`, `Rewrite cheaper`, `Do not run by default`, `Release only`.

---

## Deep-Dive & Collaboration Protocol

- **Provisional States:** Use provisional working states while reasoning with the user. Convert to final dispositions only after PR/code verification.
- **Single-Test Deep Dive:** When a test is ambiguous or `Medium` confidence:
  1. Read test body & introducing PR (`gh pr view`).
  2. Trace guarded code path/workaround to confirm it still exists.
  3. Surface evidence & tradeoffs to user before recording final disposition.
- **Family Review:** Group related tests (tags, import/upgrade, patch-backed, auth/config) to classify clusters efficiently.

---

## Audit File Architecture

- **`repo-audit.yaml`**: Repo slug, test roots, profile, workflow names, decision bucket labels.
- **`audit-metadata.yaml`**: Handwritten group metadata, per-test overrides, review decisions.
- **`test-provenance.json`**: Machine-readable joined provenance dataset.
- **`TEST_PROVENANCE.md`**: Auto-generated Markdown report (do not edit manually).

---

## Guardrails Checklist

- [ ] Use deterministic Python scripts for discovery and provenance; do not maintain Markdown report manually.
- [ ] Keep ownership analysis and dispositions in handwritten `audit-metadata.yaml`.
- [ ] Never mass-classify tests based on age or execution time alone.
- [ ] Do not assume an introducing PR proves the guarded bug/fix still exists today.
- [ ] Verify each audit scope has globally unique Go test names.
- [ ] Validate row coverage before trusting report totals.

---

## Starter Prompt

```text
Use $pulumi-test-rationalization-audit to bootstrap an audit in this repo, build provenance, and then help me review the biggest test families one at a time. Keep the process collaborative and do not silently classify ambiguous tests.
```
