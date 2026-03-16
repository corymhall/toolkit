---
name: workflow-cheatsheet
description: Prescriptive Gas Town dispatch instructions for the PR sling workflow. Use whenever the user asks to sling a bead using the PR sling workflow, asks how to dispatch work that must land through a GitHub PR, or wants the exact `gt sling` command and polecat instructions for PR-owned work.
---

# Workflow Cheatsheet

This cheatsheet currently defines one workflow only: the PR sling workflow.

If the user names the PR sling workflow, follow this skill directly. If the
user asks for some other workflow, say this cheatsheet only covers the PR sling
workflow right now and do not invent extra workflow variants.

## When to use the PR sling workflow

Use it when all of these are true:

- The work should be dispatched with `gt sling`.
- The repo must land through a GitHub PR instead of Refinery owning the merge.
- The same polecat should keep ownership of the branch and PR through review.

## Required inputs

Gather these before dispatching:

- bead ID
- target rig
- optional target crew member
- any user wording that should be preserved in the polecat instructions

If the bead does not exist yet, or it lives in the wrong rig, fix that first.

## Command pattern

Use this exact command shape:

```bash
gt sling <bead-id> <rig> --no-merge --args "PR sling workflow. Create and manage a GitHub PR for this issue. Record the PR URL or PR number on the bead. Do not run gt done until the PR is merged. While waiting on CI or review, use gt handoff with the PR number and current status. Address review feedback on the same branch."
```

If the user wants a specific polecat or crew target, add `--crew <name>`:

```bash
gt sling <bead-id> <rig> --crew <name> --no-merge --args "PR sling workflow. Create and manage a GitHub PR for this issue. Record the PR URL or PR number on the bead. Do not run gt done until the PR is merged. While waiting on CI or review, use gt handoff with the PR number and current status. Address review feedback on the same branch."
```

## Execution rules

1. Always use `--no-merge` for this workflow.
2. Always put the PR lifecycle instructions in `--args` in plain language.
3. Do not substitute `--merge=mr`, `--merge=direct`, or `--merge=local`.
4. Do not tell the polecat to run `gt done` immediately after opening the PR.
5. When the user says to sling a bead using the PR sling workflow, execute the
   sling command instead of replying with a theoretical comparison of workflows.

## Why this workflow exists

This workflow is for sticky PR ownership. The same polecat should keep the same
branch alive, open the PR, wait through CI and review, then resume on that
branch to address feedback.

`--no-merge` is the important switch because this is not a Refinery-owned merge
queue flow. If you want the same polecat to keep owning the PR, do not treat
the PR creation step as the end of the job.

## Response pattern

After dispatching, report the key facts plainly:

- bead that was slung
- target rig
- whether a specific crew target was used
- that the PR sling workflow instructions were included

## Example requests this skill should satisfy

- "Sling `tool-xyz` to `awsx` using the PR sling workflow."
- "Dispatch `gt-abc` to `gastown` with the PR sling workflow."
- "Send `tool-123` to `toolkit` for PR-owned work, same polecat should keep the PR."
