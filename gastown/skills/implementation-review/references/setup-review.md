# Setup Review Reference

## TOC

1. Visibility constraint
2. Create review checkpoint
3. Launch review workers

## 1. Visibility constraint

Fresh slung review workers do not automatically share the current session's
dirty workspace state.

Before launching reviewers, ensure:
- the code to review is visible on the pushed branch
- review inputs exist in shared/committed form

Do not sling reviewers against local-only dirty state and assume they can read it.

## 2. Create review checkpoint

Suggested shared directory:

```bash
TOP=$(git rev-parse --show-toplevel)
RIG_ROOT=$(printf '%s\n' "$TOP" | sed -E 's#/crew/[^/]+$##; s#/polecats/[^/]+/[^/]+$##')
REVIEW_RUN_ID=$(date +%Y%m%d-%H%M%S)
REVIEW_DIR="$RIG_ROOT/.runtime/reviews/<feature>/$REVIEW_RUN_ID"
mkdir -p "$REVIEW_DIR"
cp docs/plans/<feature>/spec.md "$REVIEW_DIR/spec.md"
test -f docs/plans/<feature>/plans.md && cp docs/plans/<feature>/plans.md "$REVIEW_DIR/plans.md"
test -f docs/plans/<feature>/session-context.md && cp docs/plans/<feature>/session-context.md "$REVIEW_DIR/session-context.md"
test -f docs/plans/<feature>/session-ledger.md && cp docs/plans/<feature>/session-ledger.md "$REVIEW_DIR/session-ledger.md"
git add -A
git commit -m "checkpoint: prepare <feature> for implementation review"
git push
```

The review checkpoint is not final completion. It is the stable state review
workers should inspect.

## 3. Launch review workers

Always run:
- one general review with `--agent codex`
- one general review with `--agent claude`

Optionally run:
- one specialist review when `review_profiles_selected` is a strong fit

Typical commands:

```bash
gt sling mol-review-implementation <target> --agent codex \
  --var feature="<feature>" \
  --var reviewer_label="codex" \
  --var spec_scope="$REVIEW_DIR/spec.md" \
  --var impl_scope="origin/$(git branch --show-current)" \
  --var categories="all" \
  --var review_profile="general" \
  --var output_path="$REVIEW_DIR/codex-review.md"

gt sling mol-review-implementation <target> --agent claude \
  --var feature="<feature>" \
  --var reviewer_label="claude" \
  --var spec_scope="$REVIEW_DIR/spec.md" \
  --var impl_scope="origin/$(git branch --show-current)" \
  --var categories="all" \
  --var review_profile="general" \
  --var output_path="$REVIEW_DIR/claude-review.md"
```

Launch discipline:
- do not fire multiple slings at the same idle target in parallel
- prefer distinct reviewer targets or launch sequentially and confirm pickup
