---
name: workflow-cheatsheet
description: Prescriptive Gas Town workflow entries. Use whenever the user asks to use a named workflow from the cheatsheet, wants the exact commands/questions for a saved workflow, or asks how to dispatch work according to a repeatable workflow. This cheatsheet can grow over time; right now the only defined entry is the PR sling workflow.
---

# Workflow Cheatsheet

This skill is a container for named workflows.

Keep each workflow entry prescriptive. When the user asks for a named workflow,
find that section and follow it. If the user asks for a workflow that is not
documented here, say which workflows are currently defined instead of inventing
one.

## Defined workflows

- PR sling workflow

## PR sling workflow

Use this workflow when all of these are true:

- The starting point is usually a GitHub issue, not an existing bead.
- The work should be dispatched to a polecat.
- The repo should land through a GitHub PR, not Gas Town's merge queue.
- The same polecat should keep ownership of the branch and PR through review.

If the user already has an approved bead and a final sling message, you can
skip the research and approval steps and move straight to dispatch.

### Ask first

Ask only for the missing essentials:

- GitHub issue URL, or `owner/repo` plus issue number
- target rig
- any special emphasis the sling message should include

If the user already supplied those, do not ask again.

### Research the issue before creating a bead

Before creating a bead, spawn one bounded sidecar subagent to inspect the
GitHub issue and prepare a draft. Use `gh` for GitHub lookups.

The sidecar should propose:

- bead title
- bead type: `task`, `bug`, or `feature`
- short bead description that references the GitHub issue
- sling message for the eventual assignee

Keep main-session ownership of the workflow. The sidecar is only for issue
research and draft preparation.

If the issue type is unclear, default the bead type to `task`.

### Approval gate

Show the user the proposed draft before creating anything:

- GitHub issue reference
- proposed bead title and type
- proposed sling message

Wait for approval before you create the bead or run `gt sling`.

### Create the bead after approval

After approval:

- create the bead in the rig that owns the code
- include the GitHub issue reference in the bead description
- preserve the approved sling message wording unless the user changes it

### Sling command

This is a polecat-only workflow. Do not offer `--crew` here.

Use these flags:

- `--create`
- `--no-merge`
- `--no-boot`
- `--no-convoy`

Use `--args` for the short execution directive that should show up in the
executor's work instructions. Use `--message` for the longer approved context
message. If the message is multi-line, pass it via `--stdin`.

Preferred command pattern:

```bash
gt sling <bead-id> <rig> --create --no-merge --no-boot --no-convoy \
  --args "PR sling workflow. Create and manage a GitHub PR for this issue. Record the PR URL or number on the bead. Do not run gt done until the PR is merged. While waiting on CI or review, use gt handoff with the PR number and current status. Address review feedback on the same branch." \
  --subject "GitHub issue context" --stdin <<'EOF'
<approved sling message>
EOF
```

When `--args` is supplied on the CLI and `--stdin` is used, stdin feeds the
`--message` payload.

### Execution rules

1. Do not create the bead until the user approves the draft.
2. Do not dispatch until the user approves the sling message.
3. Do not use merge-queue flags for this workflow.
4. Do not offer `--crew`; this workflow targets polecats only.
5. Do not tell the polecat to run `gt done` immediately after opening the PR.
6. Use a sidecar for GitHub issue research, not for owning the workflow.

### Response after dispatch

After dispatching, report:

- GitHub issue used
- bead created
- target rig
- that the polecat-only PR sling flags were used
- that the approved context message was attached

### Example requests this skill should satisfy

- "Use the PR sling workflow for this GitHub issue and sling it to `awsx`."
- "Take issue 123 in `owner/repo`, draft the sling message, and use the PR sling workflow."
- "Research this issue first, let me approve the message, then create the bead and sling it with the PR workflow."
