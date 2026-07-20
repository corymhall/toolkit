---
name: harness-evaluation
description: Evaluate real Pi and Codex sessions against centralized criteria for personal and repo-local skills, identify whether skills helped, were neutral, or made work worse, and recommend evidence-based harness changes. Use for daily skill review, after human correction or a restart, or when reviewing one or more session JSONL files after the fact.
disable-model-invocation: true
---

# Harness Evaluation

Evaluate skills from real collaborative sessions. This is a personal field-
evaluation workflow, not a repo harness bootstrap and not a synthetic prompt
eval.

The evaluation criteria live here so repo-local and third-party skills do not
need to ship personal evaluator metadata. Read
[references/skill-evaluations.md](references/skill-evaluations.md) for named
skills in scope. When a skill is not cataloged, derive a temporary evaluation
contract from its description and instructions; do not add it to the catalog
unless the user wants to keep evaluating it.

Read the toolkit's
[skill prompting lens](../../../docs/skill-prompting-lens.md) before changing a
skill. When the finding concerns sidecars, handoffs, or orchestration, also read
the [Codex model workflow lens](../../../docs/codex-model-workflow-lens.md).

## Modes

### Targeted retrospective

Use when the user names session files, a session directory, a task, or a human
correction. Inspect the relevant active conversation branches completely enough
to reconstruct decisions before and after the correction.

### Daily scan

For a scheduled scan, read and follow
[references/scheduled-workflow.md](references/scheduled-workflow.md). It uses the
bundled SQLite state CLI to carry cursors, unreviewed findings, decisions, and
worktree review status across days.

For an ad hoc scan without persistent state, use the bundled helpers directly:

```bash
SKILL_DIR=<directory containing this SKILL.md>
python3 "$SKILL_DIR/scripts/recent_rollouts.py" --hours 24
python3 "$SKILL_DIR/scripts/recent_pi_sessions.py" --hours 24
```

Both scripts accept `--root`, `--since`, and `--json`, use latest user/assistant
activity, and surface follow-up user messages so human corrections are visible
during shortlisting. Report the matched session count. Inspect full session
files only after shortlisting.

Prioritize sessions with human correction, backing out or restarting work,
repeated attempts, unexpected skill activation, tool failures, recovery
messages, or substantial implementation/review work. Also sample at least one
apparently successful skilled session when practical so the review is not based
only on failures.

The helpers locate evidence; their keywords and summaries are not evaluation
results.

## Reconstruct The Session

For each material session, capture:

- the user-visible goal and how it evolved;
- the repository and task boundary;
- skills injected, read, or conspicuously absent, including when they became
  active;
- important proposals and implementation decisions before human correction;
- user corrections, rejected work, restarts, and accepted tradeoffs;
- review findings and whether they exposed defects or expanded scope;
- relevant tool/interface failures and repository constraints;
- the resulting implementation or artifact when needed to judge the decision.

For Pi, follow the active `parentId` branch by default. For Codex, ignore
`session_meta` instruction noise. Treat injected skill bodies and available-
skill listings as attribution evidence, not as the user's actual request.

Do not infer that a skill was followed merely because it was loaded. Do not
blame a skill that was unavailable or activated only after the harmful decision.

## Evaluate Each Skill

Use the named criteria from the central catalog, plus these common dimensions:

1. **Activation** — correct trigger, false activation, or missed/late activation.
2. **Adherence** — which material instructions were followed, ignored, or
   impossible to apply.
3. **Decision effect** — what scope, fallback, architecture, test, review, or
   collaboration decision changed because of the skill.
4. **Human correction** — whether the skill prevented, caused, or failed to
   prevent the correction.
5. **Cost** — context, questions, artifacts, review lanes, implementation state
   space, test burden, and review difficulty added.
6. **Counterfactual** — the strongest evidence for what likely would have
   happened without the skill. Keep confidence explicit.
7. **Owning layer** — personal skill, repo-local skill/docs, harness tool or
   schema, model behavior, environment, task-local context, or no durable change.

Classify the observed effect without a numeric score:

- `helped`
- `neutral`
- `harmed`
- `missed activation`
- `false activation`
- `insufficient evidence`

A good final result does not prove a skill helped. A failed command does not
prove a skill harmed. Look for the intervention's effect on decisions and human
correction.

## Evaluate Interactions

Skills can be individually reasonable and harmful in sequence. Check whether:

- one skill broadened the surface and another enforced it as a specification;
- repository guidance and a personal workflow reinforced or contradicted each
  other;
- review converted residual risk into required implementation work;
- a language skill made an unnecessary product design more polished;
- a late collaborative or author pass corrected an earlier workflow failure;
- the same instruction is duplicated across layers without changing behavior.

Evaluate repo-specific skills as the contributor baseline and personal skills as
an optional enhancement. Do not require a repo-local skill to depend on this
personal toolkit.

## Change Threshold

Prefer field evidence over toy prompt outcomes. Recommend a durable change when:

- one session exposes a clear high-severity failure, unsafe instruction, or
  wrong trigger; or
- repeated sessions show the same correction, friction, or neutral ceremony.

Otherwise record the observation and gather more field use. `No change` is a
successful outcome.

Before recommending skill guidance, determine whether the failure is actually
owned by a tool description, schema, validator, runtime implementation,
repository documentation, or missing deterministic check. Fix the owning layer
instead of teaching a skill to work around it.

In an interactive or targeted retrospective, report before editing. A scheduled
daily evaluator may make only the objective personal-toolkit corrections defined
in the scheduled workflow, and must leave them for independent review. Record
all judgment calls without editing.

## Output

Return a compact evidence-backed retrospective:

```markdown
## Sessions Reviewed
- paths, time window, task summary

## Skill Effects
| Skill | Activation | Effect | Confidence | Evidence |

## Cross-Skill Or Harness Findings
- interaction and owning layer

## Human Corrections
- what changed and whether existing guidance should have prevented it

## Recommendations
- no change / observe / exact personal-skill, repo-skill, doc, tool, or check change

## Residual Uncertainty
- evidence still needed
```

Lead with harmful or missed interventions, then positive evidence. Quote or
reference the concrete session turn, decision, file, or review finding that
supports each conclusion. Keep daily reviews brief when no recurring pattern is
present.
