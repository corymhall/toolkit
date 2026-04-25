# First Run

## Contents

- [Default posture](#default-posture)
- [Canonical first session](#canonical-first-session)
- [Guidance for unfamiliar repos](#guidance-for-unfamiliar-repos)
- [Good first prompts](#good-first-prompts)
- [What success looks like](#what-success-looks-like)

Read this when the user is new to the audit method, wants a teammate-ready starting point, or asks to run the audit in a different Pulumi repo.

## Default posture

Treat the skill as a collaborative workflow, not an autonomous classifier.

- bootstrap the files and provenance for the user
- explain what each generated file is for
- help the user review families or hard individual tests iteratively
- surface evidence and tradeoffs before locking in ambiguous dispositions

## Canonical first session

1. Confirm the target repo and pick an initial suite to audit.
   Do not depend on presets. In an unfamiliar repo, guide the user through three choices:
   - profile: `bridged-provider`, `native-provider`, or `component-library`
   - initial suite: one cohesive root such as `examples`, `provider`, or `tests/sdk/yaml`
   - scope size: start with one root that is expensive or strategically important, not the whole repo

2. Choose the profile.
   Use these heuristics:
   - choose `bridged-provider` when the repo is mostly a Pulumi wrapper over a Terraform provider and bridge ownership is a real bucket
   - choose `native-provider` when the repo owns provider behavior directly and there is no bridge bucket
   - choose `component-library` when the repo mostly composes other providers/resources into higher-level components

3. Choose the initial suite.
   Prefer one root with a coherent story:
   - `examples/` when the expensive surface is example/integration coverage
   - `provider/` when the expensive surface is provider-local tests
   - `tests/sdk/*` or similar when the repo has focused feature suites

Start with a root that has one or more of:
- expensive cloud programs
- clear family structure
- obvious maintenance pain
- known flake or runtime cost
- high-leverage candidate buckets such as patch-backed, upgrade, or broad-smoke

4. Initialize the audit workspace.
   Set `SKILL_DIR` to the actual loaded skill directory before copying these examples.

```bash
python3 "$SKILL_DIR/scripts/init_audit_files.py" \
  ./audit \
  --profile native-provider \
  --repo pulumi/pulumi-kubernetes \
  --test-root tests/sdk/yaml \
  --suite-label "tests/sdk/yaml"
```

Presets are optional convenience only. They are not required for the workflow.

5. Build machine-readable provenance.

```bash
python3 "$SKILL_DIR/scripts/build_go_test_provenance.py" \
  all \
  ./audit/repo-audit.yaml \
  --repo-root .
```

6. Inspect provenance before trusting it blindly.
   The most common failure mode in unfamiliar repos is moved-file provenance. If many rows point to a bulk test-move PR rather than a behavior-introducing change:
   - add `history.moved_path_hints` entries in `repo-audit.yaml`
   - rerun provenance generation
   - manually spot-check one or two suspicious rows before making big calls

   Copy-pasteable pattern:

```yaml
history:
  moved_path_hints:
    - match: "tests/sdk/yaml/await_test.go"
      also_search:
        - "tests/sdk/java/await_test.go"
```

   Notes:
   - `match` is matched against the end of the current relative test path, so using the current file path from the provenance row is usually safest.
   - `also_search` should list former relative paths where the same test function likely lived before a rename or directory move.
   - If you only know the old directory, start with the same filename under that former directory and rerun before adding broader hints.

7. Start the handwritten review layer.
   Begin with obvious families, not one-off edge cases:
   - tags and normalization families
   - import or upgrade families
   - patch-backed tests
   - broad smoke examples

8. Regenerate the markdown report whenever metadata changes.

```bash
python3 "$SKILL_DIR/scripts/render_test_report.py" \
  ./audit/repo-audit.yaml \
  ./audit/audit-metadata.yaml
```

9. Validate the current checkpoint.
   Use progress mode while the audit is still in flight. Use complete mode only when you believe every active test has row-level review data.

```bash
python3 "$SKILL_DIR/scripts/validate_audit.py" \
  ./audit/repo-audit.yaml \
  ./audit/audit-metadata.yaml \
  --mode progress
```

When the audit is complete:

```bash
python3 "$SKILL_DIR/scripts/validate_audit.py" \
  ./audit/repo-audit.yaml \
  ./audit/audit-metadata.yaml \
  --mode complete
```

## Guidance for unfamiliar repos

When the user has not chosen a suite yet, help them decide rather than guessing silently.

Ask or determine:
- where the repo keeps expensive or integration-style tests
- whether there is an obvious “main pain” suite to start with
- whether the repo has broad smoke, patch-backed, or upgrade-focused clusters

Good default behavior:
- inspect the repo for `_test.go` roots
- identify 2-3 plausible starting suites
- recommend one and say why it is the best first slice
- keep the first pass narrow enough that the user can understand the report

## Good first prompts

These are good teammate-facing prompts to model or suggest:

- `Use $pulumi-test-rationalization-audit to bootstrap an audit in this repo, build provenance, and then help me review the biggest test families one at a time.`
- `Use $pulumi-test-rationalization-audit to audit the examples suite here. Keep the process collaborative and do not silently classify ambiguous tests.`
- `Use $pulumi-test-rationalization-audit to analyze one test deeply with me. I want the evidence, likely owner, candidate dispositions, and the cheapest replacement shape if we remove it.`

## What success looks like

For a first useful checkpoint, the repo should have:

- `repo-audit.yaml`
- `audit-metadata.yaml`
- `test-provenance.json`
- `TEST_PROVENANCE.md`

And the agent should be able to say:

- how many active tests were traced
- how much row coverage exists so far
- which tests are still unresolved, if any
- which families are obvious next review targets
- whether the current checkpoint is only progress-valid or truly complete
