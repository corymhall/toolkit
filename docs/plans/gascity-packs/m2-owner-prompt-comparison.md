# M2 Owner Prompt Comparison

This note compares the current Gastown `crew` prompt shape with the proposed
local `base` owner-session prompt.

Reference source:

- `~/github/gascity/examples/gastown/packs/gastown/prompts/crew.md.tmpl`

The goal is not to fork blindly. The goal is to make each retained or removed
behavior explicit.

## Keep As Concepts

| Crew Prompt Element | Keep? | Why |
|---------------------|-------|-----|
| Light local identity framing (`rig/crew/<name>`) | yes | A stable local identity is useful even if the full town mythology is trimmed away. |
| Long-lived identity | yes | The local owner session should still be persistent and context-rich. |
| Direct collaboration with the human | yes | The owner session is still the main planning and implementation partner. |
| Ownership of larger work | yes | This is the core reason the `base` pack owns the owner-session path. |
| Selective sidecar usage | yes | The owner session should decide when to use helpers instead of being replaced by them. |

## Remove Entirely

| Crew Prompt Element | Remove? | Why |
|---------------------|---------|-----|
| Full Gas Town mythology / tutorial framing | yes | The local pack should not depend on the whole town-role worldview to make sense. |
| Prefix routing instructions (`hq-*`, project prefix routing) | yes | These are current-town mechanics, not owner-session responsibilities. |
| Cross-rig worktree workflow | yes | Useful in Gastown, but too specific to carry into the local owner prompt by default. |
| Push-directly-to-main crew rule | yes | The local owner prompt must read repo policy from config, not inherit a global rule. |
| `gc nudge` / mail delivery protocol | yes | Agent-to-agent wakeup mechanics should not be base prompt defaults. |
| Gas Town architecture tutorial blocks | yes | The local owner prompt should be smaller and more role-specific. |

## Keep Only As Adapted Ideas

| Crew Prompt Element | Adapt? | Why |
|---------------------|--------|-----|
| Mail / handoff behavior | maybe | Keep concise guidance only if local owner sessions still actively use mail; remove the town-architecture lecture around it. |
| `approval-fallacy` fragment | maybe | The “finish work without waiting” idea is useful, but the exact wording assumes Gastown lifecycle and direct push patterns. |
| `operational-awareness` fragment | maybe | Some operational discipline is good, but Dolt/mail/nudge specifics are too Gastown-specific as written. |
| `command-glossary` fragment | maybe | A local version may help, but only if it reflects local pack commands rather than town machinery. |
| `capability-ledger` framing | maybe | The ownership/track-record framing may still be useful, but it should not pull in town-role assumptions. |

## Expected Behavior Changes If Removed

| Removed Element | Likely Behavior Change |
|-----------------|------------------------|
| Full town mail/hook instructions | The local owner session becomes less auto-patrolling and more directly user-driven, while still leaving room for a lighter mail model if needed. |
| Direct-to-main crew rule | Landing behavior becomes policy/config-driven instead of prompt-driven. |
| Gas Town architecture sections | The prompt becomes shorter and easier to reason about, but loses some built-in onboarding. |
| Cross-rig worktree instructions | Cross-repo fixups will need explicit documentation elsewhere if still desired. |

## Questions For Review

- Which of the “adapt” items should survive into the local owner prompt?
- Do we want a short local onboarding section to replace the removed
  architecture/tutorial blocks?
- Should the local owner prompt say anything about landing behavior at all, or
  should that live entirely in policy/config and formulas?

## Current Decision Snapshot

- Keep `rig/crew/<name>` style identity framing.
- Remove the heavier town-role mythology and tutorial framing around it.
- Keep minimal durable mail behavior for handoff/resume/archive.
- Remove the broader town communication protocol from the owner prompt.
