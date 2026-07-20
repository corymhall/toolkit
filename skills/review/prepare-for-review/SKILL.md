---
name: prepare-for-review
description: Perform one author-side pass over the current implementation before independent review, using the active conversation as the source of truth to simplify the change, apply relevant implementation guidance, improve code documentation, and verify focused tests and repository hygiene.
disable-model-invocation: true
---

# Prepare For Review

Prepare the current implementation for independent review. This is an author
pass in the main session: use the conversation context, inspect the complete
diff, and fix clear author-owned issues. Do not launch sidecars from this skill.

Default to the complete current change unless the user names another target. If
the current branch or pull request has an obvious base, include its committed
diff together with working-tree changes. Otherwise use the working-tree diff.
When the tree is clean and no base or review range is clear, ask for the intended
branch, pull request, or ref range instead of concluding there is nothing to
prepare.

The session conversation is the source of truth for intent. Plans, design notes,
and task descriptions are useful but lossy context; do not promote every detail
in them into a requirement.

## Author Pass

### 1. Reconcile With Intent

Re-read the request and subsequent decisions. Check the implementation against:

- the user-visible outcome
- constraints and tradeoffs agreed with the user
- explicit non-goals and deferred work
- accepted manual steps or conservative fallback behavior

If the implementation reveals a product or scope decision that was not settled,
return to the user instead of silently choosing the larger solution.

### 2. Simplify The Complete Change

Look for complexity that can be removed without losing the intended behavior:

- abstractions, states, or result types that have no distinct caller-visible use
- automatic inference or recovery that could safely stop with useful guidance
- speculative edge-case support with no current user, data, or repository evidence
- duplicated behavior, dead helpers, and tests for deliberately unsupported cases
- a difficult final 10% whose safe fallback preserves existing behavior

Prefer the smallest durable implementation. Do not expand scope merely to make
the change feel complete. When rare-case support adds disproportionate code or
review burden, preserve the fallback and document the limitation.

### 3. Apply Relevant Implementation Guidance

Identify the languages and domains actually changed, then revisit only the
applicable implementation skills and references. For non-trivial Go changes,
apply `go-development` to the final diff rather than copying local patterns
uncritically. Keep domain checks bounded to behavior the change actually owns.

### 4. Document The Code

Use the reasoning retained in this session to make the implementation
maintainable:

- document exported APIs when appropriate
- explain non-obvious purpose, invariants, safety boundaries, and tradeoffs
- add examples when metadata or data flow would otherwise be hard to follow
- update user-facing documentation when behavior or recovery steps changed

Comments should explain why the code exists or what contract it preserves. Do
not add comments that merely narrate obvious statements.

### 5. Check Proof And Repository Hygiene

- Ensure tests prove the intended behavior and meaningful fallback.
- Do not add a matrix of hypothetical cases that the implementation does not
  claim to support.
- Read and follow applicable repository instructions.
- Check generated outputs and file placement when relevant.
- Run the narrowest meaningful formatting, lint, and test gates, then broader
  repository-standard validation when justified and practical.

## Boundaries

- Perform one focused pass; do not create a new plan or checklist artifact.
- Make clear local improvements, but ask before changing agreed product scope.
- Do not commit, post review comments, or invoke `request-review` automatically.
- Finish by summarizing edits made, validation run, accepted limitations, and
  anything that still needs user judgment.
