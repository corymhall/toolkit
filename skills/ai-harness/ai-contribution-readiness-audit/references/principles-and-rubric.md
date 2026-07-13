# Diagnostic Checklist

Use these questions during the Explore phase to assess each category. Answer with concrete evidence (file paths, commands, observed behavior). Don't score numerically — just identify what exists, what's missing, and what's broken.

## Instruction Contract
- Does an AGENTS.md (or equivalent) exist at the repo root?
- Does it list actual commands to run (not just prose about what to do)?
- Does it include forbidden actions / "never do this" rules?
- Does it cover escalation triggers (when to stop and ask)?
- Are there scoped instruction files for complex subdirectories?
- Could an AI agent read this file and know exactly how to format, lint, test, and submit a change?

## Verification Loop
- Is there a canonical fast test command (e.g. `make test-fast`, `npm test`, `go test ./...`)?
- Is there a full test command that CI also runs?
- Do local commands match CI commands (same tool, same flags)?
- Can you run format + lint + test with 3 or fewer commands?
- Are test commands documented somewhere an agent would find them?

## Safety Rails
- Are risky operations (destructive git, network writes, production deploys) explicitly called out?
- Is there an approval model for high-risk commands?
- Are sandbox/permission boundaries documented?
- Does CI block unsafe patterns (force push, skipped hooks, etc.)?

## Architecture Clarity
- Is there a module map showing what lives where and what owns what?
- Are module boundaries explicit (documented or enforced by linters/tests)?
- Can an AI agent figure out which files to touch for a given change without reading the entire codebase?
- Are stable interfaces/contracts identified?

## Task Surface
- Does a Makefile, justfile, or script catalog exist?
- Are targets named consistently (fmt, lint, test, build, etc.)?
- Are generated artifact workflows explicit (e.g. "if you change X, run Y to regenerate Z")?
- Do docs reference the same commands that actually work?

## Testability
- Is there a fast targeted test path (test one package/module, not the whole suite)?
- Is test depth guidance documented (unit → integration → e2e)?
- Can an AI agent add a test near its edit and run just that test?
- Are snapshot/contract tests used for user-visible behavior?

## Observability
- Are there structured logs or events with stable names?
- Is there an error taxonomy or at least consistent error patterns?
- Does a runbook or debug guide exist?
- Can an AI agent diagnose a test failure from the output alone?

## Contribution Ergonomics
- Does a PR template exist with required sections (problem, validation, risk)?
- Is there a reviewer checklist?
- Are contribution rules documented (CONTRIBUTING.md or equivalent)?
- Do PRs require evidence of test execution?

## Anti-Drift Controls
- Are schema/docs/generated file regeneration commands documented?
- Does CI fail on drift (e.g. generated file not committed, docs out of date)?
- Are lockfile updates enforced?
