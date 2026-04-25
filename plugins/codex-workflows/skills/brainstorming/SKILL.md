---
name: brainstorming
description: Explore user intent, constraints, scope, and design options before implementation. Use when a request is fuzzy, introduces new feature or product behavior, changes existing behavior, or would benefit from comparing approaches and getting design approval before coding.
---

# Brainstorming

Turn an initial idea into an approved design before implementation starts.

## Workflow

1. Explore the current project context first. Read the relevant files, docs, and recent changes before proposing structure.
2. Match the planning weight to the task. For small and obvious work, keep the design conversational and short. For medium, risky, or fuzzy work, capture the approved direction in the repo's chosen planning surface when a durable artifact will reduce rework.
3. Ask clarifying questions one at a time. Prefer multiple-choice questions when they reduce effort for the user.
4. If the request is too broad for one implementation cycle, decompose it into smaller milestones or specs before going deeper.
5. Propose 2-3 viable approaches with trade-offs. Lead with the recommended option and explain why it fits the repo.
6. Present the recommended design in sections scaled to the work. Cover architecture, interfaces, state or data flow, failure handling, and verification when those topics matter.
7. Pause for approval before coding. Do not implement or invoke implementation-oriented skills until the user has approved the design direction.
8. Keep implementation ownership with the main Codex session. Use sidecars only for bounded research, review, or parallelizable subproblems that materially help.

## Design Guidance

- Prefer the smallest valuable adaptation over whole-workflow cloning.
- Follow the existing codebase and workflow patterns before inventing new ones.
- Suggest targeted cleanup only when it directly improves the current change.
- Break work into units with clear purpose, interfaces, and ownership boundaries.
- Use YAGNI aggressively. Cut speculative features and over-designed abstractions.
- Prefer milestone-oriented planning over hyper-detailed micro-task orchestration.

## Questioning Guidance

- Ask one question per message.
- Prefer concrete options over broad open-ended prompts.
- If the user already gave enough detail, skip extra questions and move to approach options.
- Offer diagrams or mockups only when a visual artifact will reduce ambiguity more than a written explanation.

## Outputs

Choose the lightest artifact that fits the task:

- short conversational design for small changes
- milestone list for medium work
- proposal, spec, design note, or task list for larger or riskier work

## Done Criteria

- Stop once the user has approved a clear design and any needed durable artifact exists.
- After approval, transition to implementation or plan execution without re-running the brainstorming loop.
