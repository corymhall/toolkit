# Pull Request Tone

Write like an engineer explaining a decision to another engineer. Be direct,
technically specific, conversational, and honest about evidence and uncertainty.
Do not imitate a persona or turn the description into a generated release
announcement.

## Reconstruct The Decision

Strong descriptions usually establish a causal story:

1. **Current behavior or motivating case** — what happens now.
2. **Consequence** — why a user, maintainer, or system cares.
3. **Changed behavior** — what the PR will do instead.
4. **Reasoning** — why this approach fits the problem.
5. **Evidence and boundary** — what proves it, what remains narrow or uncertain,
   and which tradeoff or alternative matters.

Not every PR needs every element. Add only the context warranted by the decision.
A small change should stay small.

## Preferred Tone

- Name the resource, property, command, lifecycle step, state shape, or failure
  mode instead of saying the change “improves handling.”
- Use plain causal transitions such as `Because`, `Instead`, `For example`, and
  `As part of this`.
- State genuine judgment directly. First person can be natural for decisions:
  `I chose`, `I think`, `we can`, or `I was originally going to`. Do not invent
  personal judgment that is absent from the source context.
- Calibrate confidence. Phrases such as `for now`, `it looks like`, `should`, or
  `I don't know of any cases` are useful when they accurately distinguish an
  expectation from verified behavior.
- Call out breaking changes plainly. Name who is affected, what changes, and the
  migration or mitigation when known.
- Stop when the useful explanation is complete. Do not add scene-setting,
  celebration, or a concluding recap.

Prefer:

> When the service returns the same collection in a different order, refresh
> records that order as a new input and the next preview proposes an unnecessary
> update. This PR treats collections explicitly marked unordered as equivalent
> when their members match.

Avoid:

> This comprehensive change enhances collection handling and improves overall
> provider robustness.

## Concrete Evidence

Use the smallest artifact that makes an important claim visible:

- a before/after configuration or state shape
- a numbered lifecycle scenario
- an actual error message
- representative CLI output
- measured behavior before and after
- a focused test result

Raw output earns space only when it proves something a reviewer needs to know.
Do not paste a long log as a substitute for explanation.

## Alternatives, Tradeoffs, And Scope

Explain an alternative when it exposes a real decision, not to perform a
mandatory brainstorm. Useful boundaries include:

- why a narrower fix is safer than a global one
- why uncertain cases preserve existing behavior
- why a broader solution belongs in another repository or follow-up
- which compatibility or migration cost was accepted
- which reviewer judgment could still change the approach

Be explicit when behavior is deliberately conservative, incomplete, guarded by
a feature flag, hard to validate, or deferred. Do not turn an honest limitation
into generic `Risk` boilerplate.

## Structure Follows Complexity

Most PRs should use short paragraphs without headings. Use a list for grouped
behavior, exceptions, migration steps, or review points. Add descriptive
headings only when a longer description needs navigation.

Do not impose this skeleton by default:

```markdown
## Summary
## Changes
## Testing
```

Repository-required headings are different and should be retained. Otherwise,
let the story determine the structure.

Issue references should be terse and accurate:

```text
fixes #123
closes #123
re #123
```

Use a closing keyword only when the PR actually resolves the issue.

## Final Voice Check

Before using the description, confirm that it:

- explains the consequence rather than merely naming the symptom
- describes changed behavior rather than narrating files
- separates evidence from expectation
- gives important decisions and tradeoffs enough context
- remains short when the change is simple
- contains no promotional filler, fabricated certainty, or generic ceremony
