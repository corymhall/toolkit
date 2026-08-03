# Central Skill Evaluation Catalog

Use these criteria only when the named skill materially participated in a
session or should plausibly have activated. They describe the intended
intervention, not a checklist that every task must satisfy.

## `collaborate`

**Intended intervention:** Build shared understanding when intent, scope,
tradeoffs, or implementation direction remain materially unsettled.

**Expected activation:** Fuzzy or high-context work; product choices; competing
solutions with meaningfully different complexity; new uncertainty discovered
during implementation.

**Non-triggers:** Routine mechanical work with settled behavior and an obvious
implementation.

**Positive signals:**

- questions changed scope, behavior, fallback, or implementation direction;
- repository evidence grounded the options before asking the user;
- the agent presented a simple/common-case option and a safe tail fallback;
- implementation paused when a newly discovered product decision mattered;
- questioning stopped once understanding was sufficient.

**Harm signals:**

- questions asked for facts available in the repository;
- generic planning or approval ceremony delayed routine work;
- complete automation was assumed without discussing manual recovery;
- discussion accumulated detail without changing a decision.

## `prepare-for-review`

**Intended intervention:** Use the author session's conversational context to
simplify and finish the complete change before independent review.

**Expected activation:** Explicit user invocation after meaningful
implementation and before independent review.

**Positive signals:**

- the complete committed and uncommitted change was inspected;
- code was reconciled with accepted scope, fallback, and non-goals;
- unnecessary states, abstractions, generic support, or tests were removed;
- non-obvious reasoning was documented by the session that produced it;
- focused validation ran without creating a new plan or review loop.

**Harm signals:**

- only a dirty working tree was inspected while committed work was missed;
- settled product scope was reopened or broadened silently;
- unsupported edge cases gained tests or implementation for completeness;
- the pass became another planning framework or invoked independent review.

## `request-review`

**Intended intervention:** Obtain independent evidence-backed findings without
letting context-free reviewers reconstruct intent or expand agreed scope.

**Expected activation:** Explicit user request for independent technical review.

**Positive signals:**

- one general lane was sufficient by default;
- every extra lane answered a distinct unresolved question;
- prompts included concise intended behavior, constraints, and non-goals;
- ordinary plans remained context, while explicit external contracts were
  handled narrowly;
- synthesis rejected unsupported or out-of-scope findings;
- review stopped after reporting.

**Harm signals:**

- lanes were selected mechanically from file type, tests, or repository docs;
- a plan became an unquestioned implementation checklist;
- the union of reviewer concerns became required work;
- residual risk or hypothetical behavior expanded product scope;
- review findings were applied without verification against code and
  conversation.

## `go-development`

**Intended intervention:** Produce direct, idiomatic Go whose architecture,
failure behavior, tests, and documentation are proportionate to current needs.

**Expected activation:** Non-trivial Go implementation, refactoring, or debug
work; as the focused language contract inside a Go review lane.

**Positive signals:**

- direct functions and concrete types were preferred;
- abstractions, state machines, interfaces, and owner types had current
  consumers or clear ownership value;
- ambiguous recovery stopped safely instead of adding inference;
- local precedent was classified as constraint, tolerated legacy, or avoidable;
- tests proved observable behavior with the smallest useful seam;
- mechanical style and modernization were delegated to repository tooling.

**Harm signals:**

- an unnecessary product design was made more idiomatic rather than removed;
- multi-step work automatically produced a service/runner/state machine;
- testability created a dependency framework larger than the behavior;
- exhaustive test matrices covered deliberately unsupported behavior;
- repository-wide modernization or cleanup escaped the requested scope.

## `aws-native-provider-runtime-design`

**Intended intervention:** Route AWS Native lifecycle work to the owning
engine/provider/schema/CloudControl boundary and keep the fix narrow.

**Expected activation:** Investigation or change to provider runtime semantics,
not routine generated SDK churn or isolated codegen edits without runtime
behavior.

**Positive signals:**

- the concrete resource and lifecycle transition were traced first;
- the owning boundary and relevant runtime values were named precisely;
- the smallest end-to-end fix and conservative fallback were presented;
- uncommon cases were measured in current schemas, tests, or user reports
  before gaining machinery;
- Read, Diff, and patch work broadened only when they had to agree;
- focused lifecycle proof was supplemented only by distinct lower-level proof.

**Harm signals:**

- the skill produced a design document automatically;
- adjacent metadata and lifecycle cases became requirements;
- a rare schema shape gained generic machinery without incidence evidence;
- every RPC or metadata category became a test checklist;
- uncertainty that could retain current behavior instead expanded comparison or
  state machinery.

## `triage-provider-issue`

**Intended intervention:** Establish attribution and the next action with enough
evidence, without turning triage into implementation ownership or a one-shot
conclusion.

**Expected activation:** Pulumi provider issue attribution, repro routing,
workaround routing, or ownership-boundary investigation.

**Positive signals:**

- confidence matched evidence and relevant counterfactuals were tested;
- duplicate, same-family, and related issues remained distinct;
- the output named the smallest next maintainer action or helper switch;
- triage stopped before implementation planning unless the user changed phase;
- blocked credentialed evidence produced a durable artifact rather than a weak
  substitute.

**Harm signals:**

- systemic incidence became a broad implementation specification;
- a plausible static explanation was presented as proven;
- cross-repository research continued after the routing question was settled;
- a long edge-case/test plan appeared in the triage artifact;
- implementation began without an explicit phase change.

## `pulumi-upgrade-provider`

**Intended intervention:** Run an actual provider upgrade with the
`upgrade-provider` tool and handle its known failure modes safely.

**Expected activation:** A provider repository is being upgraded to a new
upstream version using the tool.

**Non-trigger:** Developing or modifying the `upgrade-provider` tool itself,
unless the task also executes a real provider upgrade.

**Positive signals:**

- the canonical run loop and repository-owned patch workflow were followed;
- known failures were handled through the narrow documented path;
- unknown, repeated, or judgment-heavy failures stopped for the user;
- patch changes and post-run blockers were reviewed and reported accurately.

**Harm signals:**

- activation came from the repository/tool name rather than an actual provider
  upgrade;
- unknown state triggered speculative mutation or repeated retries;
- the skill's Git ownership rules were applied to development of the tool itself.

## `stage-pulumi-provider-repro`

**Intended intervention:** Leave the smallest durable repo-native Pulumi repro
that preserves the lifecycle discriminator.

**Positive signals:**

- the exact lifecycle transition and smallest meaningful input were preserved;
- one deterministic boundary test was preferred over a live shape matrix;
- blocked credentials produced a staged artifact and exact command;
- the repro remained distinct from renewed ownership speculation.

**Harm signals:**

- a weaker runnable path replaced the real discriminator;
- live tests duplicated unit matrices without deterministic service behavior;
- temporary transcripts replaced a maintainable repository artifact.

## `harness-evaluation`

**Intended intervention:** Turn real session evidence into conservative,
layer-correct skill and harness decisions.

**Positive signals:**

- both positive and negative sessions were considered;
- skill activation was separated from adherence and outcome;
- claims were anchored to concrete turns and human corrections;
- cross-skill interactions and the owning layer were identified;
- successful cursors and unresolved findings carried across scheduled runs;
- only objective personal-toolkit corrections bypassed prior discussion, and
  they still received independent review before merge;
- `No change` or further observation remained acceptable.

**Harm signals:**

- keyword summaries were treated as findings;
- one ordinary failure generated permanent workflow;
- final outcome was used as proof that a skill helped or harmed;
- judgment-heavy evaluation immediately edited the evaluated skills;
- failed runs advanced cursors or unresolved findings disappeared between days;
- the evaluator reviewed and merged its own autonomous fix;
- personal evaluator requirements leaked into repo-local skills.
