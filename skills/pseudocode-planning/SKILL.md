---
name: pseudocode-planning
description: Work with the user to design a workflow, lifecycle, algorithm, or system through concise pseudocode. Use when the user asks to plan in pseudocode, walk through a design step by step, or make ownership and decision flow explicit before implementation.
disable-model-invocation: true
---

# Pseudocode Planning

Use pseudocode as a shared design surface. Help the user make decisions one step at a time. Do not turn an uncertain idea into a complete specification without discussion.

## Ground the plan

1. Read an existing plan or context file when the user names one.
2. Inspect the relevant code, interfaces, and project terms before you assign ownership.
3. Start from one concrete example. Keep that example consistent while the plan develops.
4. Use the project's language when it makes the plan easier to understand. Otherwise, use compact Go-like pseudocode.

## Start with a shallow outline

Show the main scenario, lifecycle, or algorithm before you fill its details. Use placeholders for unresolved steps:

```go
type Scenario struct {
	User    *User
	Agent   *Agent
	Product *ProductCLI
	Store   *PrivateStore
}

func Step1SelectInput(s Scenario) Input {
	// Resolve this step with the user.
}

func Step2ProduceDraft(s Scenario, input Input) Draft {
	// TODO: Decide how the draft is produced and reviewed.
}
```

Include only actors, systems, state, and stores that affect the current design.

## Make boundaries visible

Use receivers and arguments to show who acts, who decides, and which interface performs work:

```go
user.Ask(agent, "Create a case from my last session.")

candidates := agent.Use(productCLI).SearchSources(...)
agent.Show(user, candidates)
selected := user.Select(candidates)

record := agent.Use(productCLI).CreateRecord(
	selected,
	StoreIn(privateStore.Records()),
)
```

When relevant, make these boundaries explicit:

- user intent, judgment, selection, and acceptance;
- agent interpretation, questions, and proposals;
- deterministic product or tool operations;
- external systems that execute or own work;
- state changes and material persistence effects;
- private, versioned, external, and temporary data.

Do not use an abstract call such as `GatherInfo()` when the tool or evidence source is part of the design. Do not add actors or storage only to satisfy a template.

## Preserve uncertainty

Do not hide an unresolved choice behind a plausible method name. Mark it as `TODO` and state what must be decided.

Do not invent fixed options, contracts, or user questions. Show where they come from when the source affects the design:

```go
supportedModes := runner.SupportedModes()
agent.Show(user, supportedModes)
```

Keep examples illustrative. Do not make an example look like a fixed product contract.

## Refine one step at a time

When the user selects a step:

1. Fill only that step and the setup needed to understand it.
2. Keep later steps as short placeholders.
3. Propagate accepted boundaries into later `TODO` comments.
4. Preserve user-approved wording and flow unless a new decision conflicts with them.
5. Return control to the user after the selected step is clear.

Work in the conversation by default. Update a plan file when the user names one or when the work needs a durable handoff, restart point, or review artifact.

## Check the result

Before you finish a step, check that:

- each important action has an owner;
- each user decision has a visible decision point;
- important tool and external-system boundaries are visible;
- material state changes name their destination;
- unresolved choices remain explicit;
- the pseudocode explains behavior without fixing unnecessary implementation details.
