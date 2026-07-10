# Config Schema

## Contents

- [`repo-audit.yaml`](#repo-audityaml)
- [`audit-metadata.yaml`](#audit-metadatayaml)
- [Notes](#notes)

Use two handwritten files:

- `repo-audit.yaml`
- `audit-metadata.yaml`

## `repo-audit.yaml`

Suggested shape:

```yaml
repo: pulumi/pulumi-aws
profile: bridged-provider

discovery:
  roots:
    - examples
    # add more roots when the scope includes provider-side tests
    # - provider
  adapter: go-top-level-tests
  include:
    - "*_test.go"

history:
  moved_path_hints:
    - match: "tests/sdk/yaml/await_test.go"
      also_search:
        - "tests/sdk/java/await_test.go"
    # When a suite was moved, add the historical path here so provenance can
    # search both the current and former locations for the earliest matching commit.

paths:
  introductions_jsonl: "test-introductions.jsonl"
  commit_prs_jsonl: "commit-prs.jsonl"

report:
  title: "examples/* Test Provenance"
  markdown_path: "TEST_PROVENANCE.md"
  machine_json_path: "test-provenance.json"

issues:
  parent_issue: 6284
  audit_issue: 4282

labels:
  decision_buckets:
    remove: "Tests We Can Remove"
    rewrite: "Rewrite Cheaper"
    move_upstream: "Ready To Move Upstream"
    conditional: "Keep - Conditionally"
    always_run: "Keep - Always Run"
    analysis: "Still Needs Analysis"
```

## `audit-metadata.yaml`

Suggested shape:

```yaml
groups:
  - tests:
      - TestFoo
      - TestBar
    layer_under_test: local-provider
    recommended_home: local-provider
    cadence: "Touched-area PRs only"
    behavior_under_test: "Shared family behavior"

metadata_overrides:
  TestFoo:
    behavior_under_test: "More specific row-level behavior"

review_overrides:
  TestFoo:
    working_state: "Needs more evidence"
    disposition: Keep
    confidence: High
    needs_migration_spike: "No"
    upstream_plan_ready: "No"
    replacement_coverage: ""
    evidence_needed: ""
    root_cause: "Short causal explanation"
    obsolete_since: ""
    last_reviewed: "2026-04-18"

special_tracking:
  patch:
    TestPatchedThing:
      files:
        - patches/example.patch
      remove_when: "Remove or reclassify when the patch is dropped."
```

## Notes

- Keep the group metadata broad and readable.
- Use per-test overrides only when the group text is too coarse.
- `working_state` is optional and useful during iterative analysis before the final disposition is settled.
- `upstream_plan_ready` controls whether `disposition: Move upstream` appears in the `Ready To Move Upstream` report bucket. Set it to `"Yes"` only when the upstream destination and replacement test shape are concrete.
- Paths are resolved relative to the directory containing `repo-audit.yaml`.
- `discovery.roots` is a list so one audit can cover multiple suites when that is intentional.
- Quote `Yes` and `No` style flags in YAML if you want to preserve them as strings.
- `history.moved_path_hints` is important in repos where tests were renamed or moved between directories; use it when provenance keeps landing on a bulk move PR.
- `history.moved_path_hints[].match` is a suffix match against the current relative test path, so copying the current path and swapping in the former directory is usually the fastest safe fix.
- Keep raw dispositions separate from report buckets.
- Store dates as ISO `YYYY-MM-DD`.
