---
name: bridge-parity-investigation
description: "Investigate established Pulumi-vs-Terraform parity gaps in bridged providers by creating or refining bridge cross-tests, after routing has already determined that bridge parity work is the next step, or when the user explicitly asks for that help. Use when Codex already knows that Pulumi has the problem and Terraform does not, and the next step is to capture, narrow, and explain that parity gap inside pulumi-terraform-bridge without debating alternate harnesses."
---

# Bridge Parity Investigation

Use this skill only when the issue is already understood as a real parity gap:
Pulumi has the problem, Terraform does not, and the bridge is the next
evidence surface.

This skill is cross-test-only. Do not spend time debating provider-only tests,
generic `pkg/tests`, or other harnesses here. If parity is not established,
stop and switch back to the appropriate repro skill.

Stay in the bridge lane. Do not restart broad issue triage here unless the
cross-test evidence contradicts the established parity story.
Prefer `triage-provider-issue` first unless a prior pass already established
the parity gap and selected this helper, or the user explicitly invoked this
skill.

Read `references/cross-test-playbook.md` before editing.

## Goal

Turn the parity gap into the smallest useful bridge cross-test investigation
and narrow the failing boundary enough that the next pass can reason about
root cause or workaround work.

## Workflow

1. Restate the established parity gap in one line.
   Example: "Pulumi update+read fails, Terraform equivalent path succeeds."
2. Identify the lifecycle path that must be preserved.
   Examples: update then read, refresh, import, diff.
3. If the work belongs in the bridge repo, move there and continue instead of
   stopping.
4. Build or refine the bridge cross-test around that path.
5. Preserve the dataflow that matters, not just the final values.
6. Instrument the failing boundary narrowly.
7. Run the targeted cross-test.
8. Record what the test proves and what it still does not prove.

## Operating Rules

- Do not start this skill unless Terraform behavior is already known.
- Preserve lifecycle shape first, then minimize.
- If a synthetic case is too clean to reproduce the parity gap, widen only the
  dataflow you need. Avoid copying large chunks of provider business logic.
- If a bridge panic would crash the test process, recover it into an assertable
  test failure rather than abandoning the cross-test approach.
- Keep the output focused on the parity boundary, not a full implementation
  theory.
- If the bridge cross-test shows the parity gap cleanly, that is success even
  if the final root cause is not finished yet.
- If a focused cross-test still cannot preserve the real discriminator, stop,
  record exactly what constraint prevented it, and hand control back with that
  constraint instead of looping indefinitely on cross-test shaping.

## Deliverable

Leave behind:

- current state
- confidence
- what is settled
- what is not settled
- next best action
- the focused cross-test
- the exact command to run it
- the lifecycle path preserved by the test
- the narrowed failing boundary
- the next unresolved bridge question
- what blocked execution, if anything
- workaround status
