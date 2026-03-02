---
name: review-implementation
description: Use when implementation work is done (or in progress) and you need to verify it matches the original spec, PRD, beads epic, or task list - checks completeness, acceptance criteria, edge cases, and scope creep
---

# Review Implementation

Multi-LLM implementation review for verifying code matches spec, identifying gaps, and tracking completion state.

## CRITICAL: Arg Detection (Read First)

**When this skill is invoked, check IMMEDIATELY if args were provided.**

### How to Detect Args

When this skill is invoked with args, the args string appears in context. Look for any of these patterns:

1. **Direct arg string** - A line like: `--models gpt,claude,gemini --categories all --scope-spec "epic cgt-22" --scope-impl "changes since start"`
2. **Invocation context** - Check if the message that loaded this skill included an `args` parameter
3. **User instruction** - The user may have said "run /review-implementation --models gpt,claude,gemini ..."

### Parsing Algorithm

If args are detected, parse them **BEFORE doing anything else**:

```
# Pseudo-code for arg parsing
args_string = [the args string you detected]

# Extract each parameter
models = extract_after("--models", args_string)  # e.g., "gpt,claude,gemini" -> ["gpt", "claude", "gemini"]
categories = extract_after("--categories", args_string)  # e.g., "all" or "completeness,quality"
scope_spec = extract_quoted_after("--scope-spec", args_string)  # e.g., "epic cgt-22"
scope_impl = extract_quoted_after("--scope-impl", args_string)  # e.g., "changes since start"
run_preflight = contains("--run-preflight-checks", args_string)  # boolean
skip_preflight = contains("--skip-preflight-checks", args_string)  # boolean
```

### Behavior When Args Detected

**If args ARE present (preflight mode):**
- ✅ Skip Step 1a (scope questions) - use `--scope-spec` and `--scope-impl`
- ✅ Skip Step 1b (model/category questions) - use `--models` and `--categories`
- ✅ Skip Step 1c (detailed category questions) - categories already specified
- ✅ Skip pre-flight checks unless `--run-preflight-checks` is present
- ✅ Proceed directly to Step 2 (explorer path discovery)

**If args are NOT present (interactive mode):**
- Ask all Step 1 questions as documented below

### Verification Checkpoint

After parsing, confirm your understanding:

```
📋 Preflight Mode Detected
- Models: [list parsed models]
- Categories: [list parsed categories]
- Spec scope: [parsed scope-spec]
- Impl scope: [parsed scope-impl]
- Pre-flight checks: [skip/run]

Proceeding directly to Step 2...
```

**CRITICAL: If you're unsure whether args were provided, default to INTERACTIVE mode and ask the user.**

---

## When to Use

- After completing implementation work against a spec
- During implementation to check progress against requirements
- Before creating a PR to verify all requirements are met
- When user asks to verify implementation matches original plan

**Sequential with review-documentation:** Review docs first (ensure spec is accurate), then review implementation (ensure code matches spec).

## Preflight Mode (Automated Invocation)

When invoked with args, skip interactive questions and proceed directly to review.

### Args Format

```
/review-implementation --models <models> --categories <categories> --scope-spec "<spec>" --scope-impl "<impl>" [--run-preflight-checks]
```

**Parameters:**
- `--models`: Comma-separated list: `gpt`, `claude`, `gemini` (default: `gpt`)
- `--categories`: `all` or comma-separated: `completeness,quality,scope,standards` (default: `all`)
- `--scope-spec`: Spec scope description (e.g., "epic cgt-22", "specs/auth.md")
- `--scope-impl`: Implementation scope description (e.g., "changes in this branch", "src/auth/")
- `--run-preflight-checks`: Optional. Run CLI pre-flight checks for Claude/Gemini before dispatch
- `--skip-preflight-checks`: Optional. Explicitly skip CLI pre-flight checks (default behavior, but explicit for clarity)

### Example Invocations

```bash
# Full automation - GPT only, all categories
/review-implementation --models gpt --categories all --scope-spec "epic cgt-22" --scope-impl "changes since epic start"

# Multi-model with specific categories
/review-implementation --models gpt,claude --categories completeness,quality --scope-spec "specs/auth.md" --scope-impl "src/auth/"

# With pre-flight checks enabled
/review-implementation --models gpt,gemini --categories all --scope-spec "epic cgt-15" --scope-impl "this branch" --run-preflight-checks
```

### Behavior in Preflight Mode

When args are provided:
1. **Skip Step 1a** - Use `--scope-spec` and `--scope-impl` instead of asking
2. **Skip Step 1b** - Use `--models` and `--categories` instead of asking
3. **Skip Step 1c** - Categories already specified via `--categories all` or explicit list
4. **Pre-flight checks** - Only run if `--run-preflight-checks` flag present
5. **Proceed directly** to Step 2 (explorer path discovery)

**Use case:** Automation from other skills (e.g., implementing-beads-epic) that already know the review parameters.

## Workflow

```mermaid
flowchart TD
    start([User invokes skill])
    check_args{Args provided?}
    parse_args[Parse preflight args]
    ask_llms[Step 1a: LLMs + Scope description]
    show_cats[Step 1b: Show categories + Review All vs Customize]
    fast_track{Review All?}
    ask_cats[Step 1c: 4 multiselect questions - review categories]
    preflight_checks[Pre-flight checks IN PARALLEL]
    check_claude[Check Claude CLI available + logged in]
    fail_claude([Abort: tell user to fix Claude setup])
    check_gemini[Check Gemini CLI available + logged in]
    fail_gemini([Abort: tell user to fix Gemini setup])
    explorer[Step 2: Explorer gathers spec paths + implementation paths]
    build_brief[Build dynamic review brief]
    dispatch[Step 3: Dispatch reviewers IN PARALLEL]
    gpt[GPT sub-agent]
    claude[Claude CLI sub-agent]
    gemini[Gemini CLI sub-agent]
    collect[Collect results via wait/session polling]
    synthesize[Step 4: Compare, deduplicate, synthesize]
    findings([Present findings with completion matrix])
    gate[Step 5.1: Gate - wait for 'go']
    show_findings[Step 5.2: Summarize + Address All vs Customize]
    all_findings{Address All?}
    select_findings[Step 5.2b: Select specific findings]
    resolve_ambig[Step 5.3: Resolve ambiguities one-by-one]
    select_actions[Step 5.4: Select actions]
    execute[Step 5.5: Execute actions]
    summary[Step 5.6: Summary of actions taken]
    followup{Step 5.7: Issues created?}
    ask_impl[Ask: Implement now?]
    implement[Implement created issues]
    done([Done])

    start --> check_args
    check_args -->|yes - preflight mode| parse_args
    check_args -->|no - interactive mode| ask_llms
    parse_args --> explorer
    ask_llms --> show_cats
    show_cats --> fast_track
    fast_track -->|yes| preflight_checks
    fast_track -->|no| ask_cats
    ask_cats --> preflight_checks
    preflight_checks -->|if Claude selected| check_claude
    preflight_checks -->|if Gemini selected| check_gemini
    preflight_checks -->|neither selected| explorer
    check_claude -->|ok| explorer
    check_claude -->|fail| fail_claude
    check_gemini -->|ok| explorer
    check_gemini -->|fail| fail_gemini
    explorer --> build_brief
    build_brief --> dispatch
    dispatch -->|if selected| gpt
    dispatch -->|if selected| claude
    dispatch -->|if selected| gemini
    gpt --> collect
    claude --> collect
    gemini --> collect
    collect --> synthesize
    synthesize --> findings
    findings --> gate
    gate --> show_findings
    show_findings --> all_findings
    all_findings -->|yes| resolve_ambig
    all_findings -->|no| select_findings
    select_findings --> resolve_ambig
    resolve_ambig --> select_actions
    select_actions --> execute
    execute --> summary
    summary --> followup
    followup -->|yes| ask_impl
    followup -->|no| done
    ask_impl -->|yes| implement
    ask_impl -->|no| done
    implement --> done
```

## Step 0: Pre-flight Checks (if Claude or Gemini selected)

**Run pre-flight checks IN PARALLEL for all selected external CLI agents.**

### Claude Pre-flight (if Claude selected)

If the user selects Claude, verify Claude CLI is available **before proceeding**:

```bash
# Check Claude CLI is installed
command -v claude >/dev/null 2>&1 || { echo "Claude CLI not installed"; exit 1; }

# Test the actual model
claude -p --model opus "Respond with only: READY" 2>&1
```

**If check fails, STOP and tell the user:**

> "Claude CLI check failed. Select GPT-only, or fix your Claude setup first."

### Gemini Pre-flight (if Gemini selected)

If the user selects Gemini 3 Pro, verify Gemini CLI is available **before proceeding**:

```bash
# Check Gemini CLI is installed
command -v gemini >/dev/null 2>&1 || { echo "Gemini CLI not installed"; exit 1; }

# Test the actual model
gemini "Respond with only: READY" --model gemini-3-pro-preview -y 2>&1
```

**If check fails, STOP and tell the user:**

> "Gemini CLI check failed. Select GPT-only, or fix your Gemini setup first."

## Step 1: Get Scope from User (FAST)

**PREFLIGHT MODE CHECK:** If args were provided (see "Preflight Mode" section above), skip this entire step. Use the provided `--scope-spec`, `--scope-impl`, `--models`, and `--categories` values and proceed directly to Step 2.

**CRITICAL: Do NOT explore the codebase yourself. Just collect scope from user.**

### Step 1a: Get Scope Descriptions

Ask the user for scope (free text):

> "What should I review?
>
> 1. **Spec scope** - what spec/requirements to review against? (e.g., "epic cgt-22", "specs/auth.md", "tasks 1-5")
> 2. **Implementation scope** - what code to review? (e.g., "changes in this branch", "src/auth/", "all files since epic start")"

### Step 1b: Configuration (Single Batched User Prompt)

**Batch all configuration into ONE user prompt with 3 questions.** Users can answer in one round-trip:

```
questions: [
  {
    question: "Which models should perform this review?",
    header: "Models",
    multiSelect: true,
    options: [
      { label: "GPT 5.3 Codex (Recommended)", description: "Codex worker-high subagent - primary lane" },
      { label: "Claude Opus", description: "Claude CLI lane - independent perspective" },
      { label: "Gemini 3 Pro", description: "Google's latest via Gemini CLI - third perspective" }
    ]
  },
  {
    question: "Review mode?",
    header: "Categories",
    multiSelect: false,
    options: [
      { label: "Review All (Recommended)", description: "Check all categories: completeness, quality, scope, standards" },
      { label: "Customize", description: "Select specific categories to review" }
    ]
  },
  {
    question: "Run CLI pre-flight checks for Claude/Gemini?",
    header: "Pre-flight",
    multiSelect: false,
    options: [
      { label: "Skip (Recommended)", description: "Assume CLIs work - faster startup" },
      { label: "Run checks", description: "Verify Claude/Gemini CLIs are working before dispatch" }
    ]
  }
]
```

**This reduces LLM round-trips from multiple separate questions to 1 batched interaction.**

### Handling Configuration Results

**Single Model Warning:**
If user selects only 1 model, show a follow-up warning:

```
question: "Only 1 model selected. Multi-model comparison provides better coverage. Proceed?"
header: "Single Model"
multiSelect: false
options:
  - label: "Add another model (Recommended)"
    description: "Go back and select additional models for comparison"
  - label: "Continue with 1 model"
    description: "Get review from single model (no comparison)"
```

**Review Mode Handling:**

- **"Review All":** Skip to Step 2 with defaults:
  - Feature Completeness ✓
  - Acceptance Criteria Met ✓
  - Edge Cases Covered ✓
  - No Scope Creep ✓

- **"Customize":** Show the 4 multiselect questions below.

**Pre-flight Handling:**

- **"Skip":** Proceed directly to dispatch - trust that CLIs work
- **"Run checks":** Execute pre-flight checks (Step 0) before dispatch

### Step 1c: Review Categories (if customizing - 4 multiselect questions)

**Question 1: Completeness**

```
question: "Which completeness checks should agents perform?"
header: "Completeness"
multiSelect: true
options:
  - label: "Feature Completeness (Recommended)"
    description: "Are all specified features/requirements implemented?"
  - label: "Acceptance Criteria Met (Recommended)"
    description: "Do implementations satisfy stated acceptance criteria?"
  - label: "Task Status Accuracy"
    description: "Are beads/task statuses accurate (closed = actually complete)?"
```

**Question 2: Quality**

```
question: "Which quality checks should agents perform?"
header: "Quality"
multiSelect: true
options:
  - label: "Edge Cases Covered (Recommended)"
    description: "Were documented edge cases handled in implementation?"
  - label: "Error Handling"
    description: "Are specified error scenarios handled correctly?"
  - label: "Test Coverage"
    description: "Are there tests for the implemented features?"
```

**Question 3: Scope**

```
question: "Which scope checks should agents perform?"
header: "Scope"
multiSelect: true
options:
  - label: "No Scope Creep (Recommended)"
    description: "Was ONLY what was specified implemented (no extras)?"
  - label: "Approach Alignment"
    description: "Does implementation follow specified approach (note deviations)?"
  - label: "No Missing Dependencies"
    description: "Were all prerequisite tasks completed before dependent ones?"
```

**Question 4: Standards**

```
question: "Which standards checks should agents perform?"
header: "Standards"
multiSelect: true
options:
  - label: "Project Conventions"
    description: "Does implementation follow CLAUDE.md and project standards?"
  - label: "API Contract Match"
    description: "Do implemented APIs match specified contracts/interfaces?"
```

**Time budget for Step 1: Under 60 seconds total.**

## Step 2: Explorer Gathers Paths (FAST)

**Dispatch an explorer subagent to discover relevant paths.**

### Epic Disambiguation

**CRITICAL: If scope description matches multiple epics (e.g., multiple "Phase 6" epics), explorer MUST:**
1. List ALL matching epics with their titles and IDs
2. Return structured output with a `DISAMBIGUATION_NEEDED` flag if multiple matches
3. Include epic titles to help distinguish (e.g., "Phase 6 Artifacts & Downloads" vs "Phase 6 Asset Equivalences")

**If disambiguation is needed**, present candidates to user:
```
question: "Multiple matching epics found. Which one should I review?"
header: "Epic"
multiSelect: false
options:
  [Dynamically populate with epic ID + title for each match]
```

### Path Discovery Prompt

```
Use the explorer subagent with this prompt package:

Find all relevant paths for implementation review.

SPEC SCOPE: [USER'S SPEC DESCRIPTION]
IMPLEMENTATION SCOPE: [USER'S IMPLEMENTATION DESCRIPTION]

Target codebase: [PATH]

Return ONLY structured lists of paths. Do NOT read file contents.

## DISAMBIGUATION CHECK (CRITICAL)

Before returning paths, check if multiple epics/specs match the scope description.
- Run `bd list` and search for matching issues
- If the scope mentions 'Phase X' or similar, check ALL epics that mention that phase
- If multiple matches exist, return DISAMBIGUATION_NEEDED: true with list of candidates

Look for SPEC paths in:
- .beads/ directory for matching issue IDs (use bd list to find relevant IDs)
- specs/ or docs/ directories for matching markdown files
- Any paths explicitly mentioned in scope description

Look for IMPLEMENTATION paths in:
- Source directories matching implementation scope
- Test files for implemented features
- Changed files (use git diff if branch specified)

Output format:
DISAMBIGUATION_NEEDED: true/false
CANDIDATE_EPICS: (if disambiguation needed)
  - cgt-XX: [Epic Title 1]
  - cgt-YY: [Epic Title 2]
SPEC_BEADS_IDS: cgt-22, cgt-11, ...
SPEC_FILE_PATHS: /path/to/spec.md, ...
IMPL_FILE_PATHS: /path/to/impl.ts, ...
TEST_FILE_PATHS: /path/to/impl.test.ts, ...

Be thorough but fast. Paths only, no content.
```

## Step 2b: Pre-Read Beads Issues

**Always pre-read beads issues to include in both GPT and Claude/Gemini prompts.**

This speeds up the review by providing spec context upfront, reducing extra round-trips during review.

```bash
# For each issue ID from explorer:
bd show cgt-XX
bd show cgt-YY
# ... etc
```

Store the output and include it verbatim in both sub-agent prompts under `## Beads Issue Contents (Pre-Read)`.

**Note:** GPT can still explore additional issues (dependencies, linked issues) using `bd` commands if needed during review.

## Step 3: Dispatch Reviewers (PARALLEL)

**CRITICAL: Dispatch reviewer lanes concurrently for true parallelism.**

**Special Note on Gemini:** Gemini requires a TWO-STEP approach to avoid serialization issues:
1. First, write the prompt to a temp file
2. Then, call gemini reading from the temp file in a concurrent lane

See "Dispatching Gemini Sub-Agent" section below for details.

```
# Dispatch sequence:

# Step 1: Write Gemini prompt to temp file
# Step 2: Dispatch all selected reviewer lanes concurrently
# Step 3: Use awaiter to keep waiting until all lanes complete/fail
```

**If you dispatch lanes sequentially, they will not run in parallel.**

### Sub-Agent Brief (DYNAMIC)

Build based on user selections from Step 1b.

**Template:**

```
You are reviewing IMPLEMENTATION against a SPECIFICATION.

Your job is to verify the code matches what was specified, identify gaps, and assess completion state.

## IMPORTANT: Review Only - No Changes

**DO NOT modify any files during this review phase.**

This is a READ-ONLY review for context gathering and gap identification. Your role is to:
- Read and analyze code
- Compare implementation against spec
- Identify gaps and issues
- Report findings

Any actual code changes will be made in a later phase after findings are reviewed.
Do not modify files during this phase.

## Review Mode: Approach-Aware

- If the outcome matches the spec, implementation is correct even if approach differs
- Note approach deviations as INFORMATIONAL, not failures
- Only flag as issues if the OUTCOME doesn't match spec

## Verification Requirement

**CRITICAL: Do NOT make assumptions about how the codebase works. VERIFY by reading code.**

Before stating how something works (e.g., "the CLI is workspace-agnostic"):
1. Read the actual code that implements it
2. Quote specific lines/functions that prove your assertion
3. If you cannot verify by reading code, mark as UNVERIFIED and flag for human review

Common assumption mistakes to avoid:
- Assuming a component hasn't changed since last review
- Inferring behavior from naming conventions without reading implementation
- Stating capabilities without checking the actual code

## Later-Phase Awareness

**CRITICAL: Before recommending improvements, check if they're already scoped for later.**

When reviewing against an issue that's part of a larger epic or brief:
1. Examine the full epic/parent issue to see all planned phases
2. Check sibling issues for work already scoped in later phases
3. **Do NOT recommend bringing forward work that's already properly scoped for a later phase**

If an improvement IS already scoped later, note it as:
> "Future-scoped: [description] is covered by [issue-id] in a later phase"

Only recommend additions/improvements if they:
- Are genuinely missing from all phases
- Are blocking current phase completion
- Represent a gap in the overall plan

## DO CHECK - Review these categories:

[Include ONLY categories user selected]

### Feature Completeness (if selected)
- Is each specified feature/requirement implemented?
- Create a checklist: requirement → implemented? → where?

### Acceptance Criteria Met (if selected)
- For each acceptance criterion, is it satisfied?
- Quote the criterion and explain how implementation meets it (or doesn't)

### Task Status Accuracy (if selected)
- Are closed tasks actually complete?
- Are open tasks actually incomplete?
- Flag any status mismatches

### Edge Cases Covered (if selected)
- For each documented edge case, is it handled?
- Where in the code is it handled?

### Error Handling (if selected)
- Are specified error scenarios handled?
- Do error messages match spec?

### Test Coverage (if selected)
- Are there tests for implemented features?
- Do tests cover specified scenarios?

### No Scope Creep (if selected)
- Is there code that wasn't specified?
- Flag additions that weren't in spec (INFORMATIONAL unless problematic)

### Approach Alignment (if selected)
- Does implementation follow specified approach?
- Note deviations as INFORMATIONAL with brief explanation

### No Missing Dependencies (if selected)
- Were prerequisite tasks completed?
- Are there incomplete dependencies?

### Project Conventions (if selected)
- Does code follow CLAUDE.md conventions?
- Naming, structure, patterns match project style?

### API Contract Match (if selected)
- Do implemented APIs match specified interfaces?
- Request/response shapes, error codes, etc.

## DO NOT CHECK - Skip these categories:

[List categories user did NOT select]

## Output Format

### Completion Matrix

| Requirement | Status | Location | Notes |
|-------------|--------|----------|-------|
| [From spec] | DONE/PARTIAL/MISSING/DEVIATED | file:line | [Details] |

### Issues (Risk-Weighted)

For each issue:
- **[SEVERITY] Issue Title**
  - Requirement: What was specified
  - Actual: What was implemented (or not)
  - Location: File and line
  - Recommendation: How to resolve

### Summary Stats
- Requirements: X total, Y complete, Z partial, W missing
- Scope creep items: N (if checking)
- Approach deviations: N (if checking)
```

### Dispatching GPT Sub-Agent (Codex)

Dispatch a GPT reviewer subagent (`worker-high`) using the brief below.
Pre-read beads issues are included in the prompt for faster review.

```text
[Sub-agent brief above]

SPECIFICATION to review against:
- Spec files: [SPEC_FILE_PATHS]

## Beads Issue Contents (Pre-Read)

[PASTE VERBATIM OUTPUT FROM `bd show` FOR EACH ISSUE HERE]

IMPLEMENTATION to review:
- Implementation files: [IMPL_FILE_PATHS]
- Test files: [TEST_FILE_PATHS]

## How to explore additional beads issues

The main spec issues are provided above. If you need to explore dependencies or linked issues:
- bd show <id> - View issue details
- bd dep show <id> - View issue dependencies
- bd list --status=open - List open issues

## Shell Command Best Practices

**CRITICAL: Path quoting**
Always wrap file paths containing special characters in single quotes:
- Parentheses: `(dashboard)`
- Brackets: `[slug]`
- Spaces

Example:
```bash
# WRONG - will fail
sed -n '1,100p' apps/web/app/(dashboard)/workspace/[slug]/page.tsx

# CORRECT
sed -n '1,100p' 'apps/web/app/(dashboard)/workspace/[slug]/page.tsx'
```

**Avoid login shell flag**
When running shell commands, prefer non-login shell:
```bash
/bin/zsh -c 'command'  # Preferred - non-login shell
```
Avoid login shell (`-l` flag) as it may trigger profile errors in sandbox environments.

## Time Management

This review may take 10-15 minutes. Take your time to:
1. Read all relevant files thoroughly
2. Cross-reference spec against implementation
3. Build a complete completion matrix

Don't rush - thoroughness is more important than speed.

## Review process

1. Read the beads issue contents provided above
2. If needed, explore dependencies or linked issues using bd commands
3. Read spec markdown files and implementation files
4. Compare: does implementation satisfy spec?
5. Return findings in specified output format

REMINDER: This is a READ-ONLY review. Do NOT modify any files.
```

### Dispatching Claude Sub-Agent via Claude CLI

Run Claude as a concurrent reviewer lane using the same brief.

```bash
claude -p --model opus "$(cat <<'PROMPT'
[Sub-agent brief above]

SPECIFICATION to review against:
- Spec files: [SPEC_FILE_PATHS]

## Beads Issue Contents (Pre-Read)

[PASTE VERBATIM OUTPUT FROM `bd show` FOR EACH ISSUE HERE]

IMPLEMENTATION to review:
- Implementation files: [IMPL_FILE_PATHS]
- Test files: [TEST_FILE_PATHS]

## How to explore additional beads issues

The main spec issues are provided above. If you need to explore dependencies or linked issues:
- bd show <id> - View issue details
- bd dep show <id> - View issue dependencies
- bd list --status=open - List open issues

## Review process

1. Read the beads issue contents provided above
2. If needed, explore dependencies or linked issues using bd commands
3. Read spec markdown files and implementation files
4. Compare: does implementation satisfy spec?
5. Return findings in specified output format

REMINDER: This is a READ-ONLY review. Do NOT modify any files.
PROMPT
)"
```

### Dispatching Gemini Sub-Agent via Gemini CLI

**CRITICAL: Use the TWO-STEP temp file approach to avoid JSON serialization issues with complex prompts.**

**WHY:** When the executing LLM constructs a long shell command containing a HEREDOC with markdown, code blocks, and special characters, parameter serialization can break (resulting in invalid command parameters). Using a temp file separates the complex prompt content from the shell command.

**Pre-read beads issues are included in the prompt for faster review. Gemini can explore additional issues if needed.**

**IMPORTANT: Gemini runs without sandbox (docker/podman not required). The prompt explicitly instructs Gemini NOT to modify files during review phase.**

**Step 1: Write prompt to temp file**

```bash
GEMINI_PROMPT_FILE="$(mktemp -t gemini_review_prompt.XXXXXX)"
cat > "$GEMINI_PROMPT_FILE" <<'GEMINI_PROMPT'
[Sub-agent brief above]

SPECIFICATION to review against:
- Spec files: [SPEC_FILE_PATHS]

## Beads Issue Contents (Pre-Read)

[PASTE VERBATIM OUTPUT FROM `bd show` FOR EACH ISSUE HERE]

IMPLEMENTATION to review:
- Implementation files: [IMPL_FILE_PATHS]
- Test files: [TEST_FILE_PATHS]

## How to explore additional beads issues

The main spec issues are provided above. If you need to explore dependencies or linked issues:
- bd show <id> - View issue details
- bd dep show <id> - View issue dependencies
- bd list --status=open - List open issues

## Shell Command Best Practices

**CRITICAL: Path quoting**
Always wrap file paths containing special characters in single quotes:
- Parentheses: `(dashboard)`
- Brackets: `[slug]`
- Spaces

Example:
```bash
# WRONG - will fail
cat apps/web/app/(dashboard)/workspace/[slug]/page.tsx

# CORRECT
cat 'apps/web/app/(dashboard)/workspace/[slug]/page.tsx'
```

## Time Management

This review may take 10-15 minutes. Take your time to:
1. Read all relevant files thoroughly
2. Cross-reference spec against implementation
3. Build a complete completion matrix

Don't rush - thoroughness is more important than speed.

## Review process

1. Read the beads issue contents provided above
2. If needed, explore dependencies or linked issues using bd commands
3. Read spec markdown files and implementation files
4. Compare: does implementation satisfy spec?
5. Return findings in specified output format

REMINDER: This is a READ-ONLY review. Do NOT modify any files.
GEMINI_PROMPT
```

**Step 2: Call Gemini reading from temp file (in parallel with GPT/Claude lanes)**

```bash
gemini "$(cat "$GEMINI_PROMPT_FILE")" --model gemini-3-pro-preview -y
rm -f "$GEMINI_PROMPT_FILE"
```

**Notes on Gemini CLI:**

- Model: `gemini-3-pro-preview`
- Runs without sandbox (prompt prohibits file modifications)
- **Timeout:** Set Bash timeout to 15 minutes (`timeout: 900000` ms)
- **Concurrency:** Dispatch Gemini lane concurrently with other reviewer lanes
- Always clean up with `rm -f "$GEMINI_PROMPT_FILE"` after Gemini finishes

### Collecting Results

**CRITICAL: Collect reviewer outputs concurrently and keep waiting until completion.**

Use the `awaiter` subagent for long-running waits and polling across reviewer lanes.
- Keep the review session active while waiting.
- Poll approximately every 2 minutes.
- Do not stop after first incomplete cycle.

**Timeouts:** Use 900000ms (15 minutes) for all agents. Reviews take time - don't give up early.

**Do NOT timeout prematurely.** When waiting for results:
- Use `timeout: 900000` (15 minutes) for all agents
- If one agent times out but others succeed, note this in the output and proceed
- Do not abandon waits early; keep collecting until success/failure is confirmed

**If you get a timeout and suspect the agent is still running:**
1. Wait an additional 2-3 minutes
2. Re-check reviewer status in the next awaiter cycle
3. Only proceed to synthesis when you have actual results (or confirmed failure)

### Handling Failures (Rate Limits, Timeouts, Errors)

**Known Sandbox Errors (Ignorable):**

These stderr messages can be safely ignored - they don't affect command execution:
- `/opt/homebrew/Library/Homebrew/help.sh: cannot create temp file` - Homebrew shell integration failing in sandbox
- Similar brew/nvm/pyenv/rbenv profile errors
- Any "Operation not permitted" errors from shell profile scripts

Only treat as actual failures:
- Command exit codes ≠ 0
- Missing expected output
- Actual tool/permission errors (not profile initialization errors)

**If Claude fails (rate limit, timeout, or error):**

1. **Notify the user explicitly:**
   > "Claude review failed due to [rate limit/timeout/error]. Proceeding with remaining agents."

2. **Continue with other agent results** - don't abort the entire review

3. **Note in final output:**
   - Add to Review Configuration: `Claude: Failed ([reason])`
   - Adjust Agent Comparison section to show only available agents
   - Note reduced cross-validation if only one agent succeeded

**If Gemini fails (rate limit, timeout, or error):**

1. **Notify the user explicitly:**
   > "Gemini review failed due to [rate limit/timeout/error]. Proceeding with remaining agents."

2. **Continue with other agent results** - don't abort the entire review

3. **Note in final output:**
   - Add to Review Configuration: `Gemini: Failed ([reason])`
   - Adjust Agent Comparison section to show only available agents

**If GPT subagent fails (rate limit, timeout, or error):**

1. **Notify the user explicitly:**
   > "GPT review failed due to [rate limit/timeout/error]. Proceeding with remaining agents."

2. **Continue with other agent results** - don't abort the entire review

3. **Note in final output:**
   - Add to Review Configuration: `GPT: Failed ([reason])`
   - Adjust Agent Comparison section to show only available agents
   - Note reduced cross-validation if only one agent succeeded

**If all selected agents fail:** Report the errors and ask user how to proceed.

### Transition to Synthesis

**Once all reviewer lanes return (or timeout/fail):**

1. **Do NOT do additional exploration** - use only what agents returned
2. **Do NOT supplement with your own reads** - synthesis uses agent outputs only
3. **Proceed IMMEDIATELY to Step 4** - don't add extra investigation
4. **If results are incomplete**, note gaps in the synthesis rather than trying to fill them

## Step 4: Synthesize Results

### Single-Agent Mode

1. Present findings directly
2. Add your own analysis
3. Note that cross-validation wasn't performed

### Multi-Agent Mode

#### 4.1 Merge Completion Matrices

Create unified matrix showing all agents' assessments (include only columns for agents that were selected/succeeded):

| Requirement | GPT | Claude | Gemini | Consensus | Location |
|-------------|-----|--------|--------|-----------|----------|
| [Req] | DONE | DONE | DONE | DONE | file:line |
| [Req] | PARTIAL | DONE | PARTIAL | REVIEW | file:line |

**Table Formatting Guidelines:**

- **Keep cell content concise** - under 30 characters per cell where possible
- **Use status shorthand** - DONE, PARTIAL, MISSING, DEVIATED (not full descriptions)
- **If requirement text is long**, abbreviate in table and reference full list above
- **Test table renders correctly** before presenting to user
- **Use consistent column widths** - don't let one cell dominate

#### 4.2 Deduplicate Issues

Merge issues, noting agreement/disagreement.

#### 4.3 Reasoning Section

For disagreements, explain which assessment is correct and why.

### 4.4 Remaining Ambiguities

List unresolved questions needing human input.

## Output Format

```markdown
# Implementation Review: [Spec/Epic Name]

## Review Configuration
- **LLMs Used:** [List agents used, e.g., "GPT + Claude + Gemini" / "GPT only" / "GPT + Gemini"]
- **Spec Reviewed:** [List of specs/issues]
- **Implementation Reviewed:** [List of impl files]
- **Categories Checked:** [List]
- **Categories Skipped:** [List]

## Completion Matrix

| Requirement | Status | Location | Notes |
|-------------|--------|----------|-------|
| ... | ... | ... | ... |

## Summary Stats
- **Total Requirements:** X
- **Complete:** Y (Z%)
- **Partial:** A
- **Missing:** B
- **Scope Creep Items:** C
- **Approach Deviations:** D (informational)

## Issues (Risk-Weighted)

### CRITICAL
- [Issues that block completion]

### HIGH
- [Significant gaps]

### MEDIUM
- [Minor gaps or quality issues]

### LOW / INFORMATIONAL
- [Scope creep, approach deviations]

## Agent Comparison (if multi-agent)

| # | Requirement | GPT | Claude | Gemini | Agree? |
|---|-------------|-----|--------|--------|--------|
| ... |

(Include only columns for agents that were selected/succeeded)

## Reasoning (if multi-agent)

[Explain disagreements and final assessment]

## Remaining Ambiguities

- [Unresolved questions]
- [Items needing human input]
```

## Step 5: Next Steps (Interactive)

### 5.1 Gate: Let User Digest Findings

> "Review complete. Say **'go'** when you're ready to discuss next steps."

### 5.2 Select Findings to Address (fast-track or customize)

**First, summarize the findings:**

> "Found X issues: Y critical, Z high, W medium, V low/informational."

**Then ask (single choice):**

```
question: "How would you like to proceed?"
header: "Findings"
multiSelect: false
options:
  - label: "Address All Issues (Recommended)"
    description: "Work through all identified issues"
  - label: "Customize"
    description: "Select specific issues to address"
```

**If "Address All":** Proceed to Step 5.3 with all findings selected.

**If "Customize":** Show the multiselect of individual findings:

```
question: "Which findings do you want to address?"
header: "Select Issues"
multiSelect: true
options:
  [Dynamically populate from identified issues]
```

### 5.3 Resolve Ambiguities

For each ambiguity in selected findings, present one at a time with options.

### 5.4 Select Actions

```
question: "What actions do you want to take?"
header: "Actions"
multiSelect: true
options:
  - label: "Create beads issues for gaps"
    description: "Track missing/incomplete items as new issues"
  - label: "Update spec to match implementation"
    description: "If implementation is intentionally different, update spec"
  - label: "Save review to markdown"
    description: "Save full review to docs/reviews/[name].md"
  - label: "Mark tasks complete in beads"
    description: "Close issues verified as complete"
  - label: "Fix implementation gaps"
    description: "Implement missing requirements"
```

### 5.5 Execute Selected Actions

#### If "Create beads issues for gaps" selected:

Ask structure preference (epic with tasks vs individual issues), then create via `bd create`.

**Best practices:**
- Link new issues to parent issue with `--parent` at create time, or `bd dep add <new-id> <parent-id> --type parent-child`
- If your environment requires explicit sync, run it; otherwise continue

#### If "Update spec to match implementation" selected:

Update markdown files or beads issues via `bd update` to reflect intentional deviations.

#### If "Save review to markdown" selected:

Ask for name, save to `docs/reviews/[name].md`.

#### If "Mark tasks complete in beads" selected:

For each verified-complete task, run `bd close <id>`.

#### If "Fix implementation gaps" selected:

Work through missing requirements, implementing each one.

#### 5.5b Verify Applied Changes

**After applying any changes (spec updates, implementation fixes, beads updates), verify they were applied correctly:**

1. **Re-read each modified file** to confirm changes applied as intended
2. **Check for syntax issues** - ensure code compiles, markdown renders, tests pass
3. **Summarize changes** - briefly note what changed in each file for user awareness

Example verification:
```
Verifying changes...
- packages/auth/service.ts: ✓ Added missing validation (lines 45-52)
- specs/auth.md: ✓ Updated to reflect implementation approach
- .beads/cgt-123.md: ✓ Status updated to closed
```

**If any change failed to apply**, note it in the summary and suggest manual intervention.

### 5.6 Summary

```markdown
## Actions Taken

- **Ambiguities resolved:** X of Y
- **Beads issues created:** [list IDs]
- **Spec updates applied:** X
- **Review saved to:** [path]
- **Tasks marked complete:** [list IDs]
- **Implementation fixes:** X requirements addressed
- **Deferred:** [list any skipped items]
```

### 5.7 Follow-Up: Implement Created Issues

**If beads issues were created in Step 5.5**, ask if user wants to implement them now:

```
question: "Beads issues created for gaps. Want to implement them now?"
header: "Implement"
multiSelect: false
options:
  - label: "Yes - implement now"
    description: "Work through the newly created issues immediately"
  - label: "No - defer to later"
    description: "Issues are tracked, implement in a future session"
```

**If "Yes":** Work through each created issue, implementing the requirements. After each implementation:
- Close the issue with `bd close <id>`
- Capture verification evidence in notes

**If "No":** End the skill. Issues remain open for future work.

## Execution Checklist

**Track each step in an internal checklist:**

- [ ] Asked user which LLMs + spec scope + implementation scope (Step 1a)
- [ ] Showed categories and asked Review All vs Customize (Step 1b)
- [ ] If Customize: asked user which review categories (Step 1c - 4 questions)
- [ ] Pre-flight checks passed IN PARALLEL (if Claude or Gemini selected)
- [ ] Dispatched explorer to gather spec + implementation paths
- [ ] Received path lists from explorer
- [ ] **If disambiguation needed: asked user to select correct epic**
- [ ] **Pre-read all beads issues with `bd show` for inclusion in agent prompts**
- [ ] Built dynamic sub-agent brief
- [ ] Dispatched ALL selected reviewers concurrently
- [ ] Used `awaiter` subagent for long-running wait/poll cycles
- [ ] Collected results from all lanes before synthesis
- [ ] **If any agent failed: notified user and proceeded with remaining agents**
- [ ] Created completion matrix
- [ ] Created comparison table (multi-agent only)
- [ ] Wrote reasoning for disagreements
- [ ] Listed remaining ambiguities
- [ ] Produced final summary with stats
- [ ] Gated: waited for user "go"
- [ ] Summarized findings and asked Address All vs Customize (Step 5.2)
- [ ] If Customize: asked user which specific findings to address
- [ ] Resolved ambiguities one-by-one
- [ ] Asked user which actions to take
- [ ] Executed selected actions
- [ ] Verified applied changes (re-read files, check syntax, summarize changes)
- [ ] Presented final summary of actions taken
- [ ] If issues created: asked user if they want to implement now (Step 5.7)
- [ ] If implementing: worked through issues, marked closed

## Common Mistakes

| Mistake | Correction |
|---------|------------|
| Exploring codebase yourself | Explorer gathers paths - you pass scope descriptions |
| Missing concurrent dispatch | Dispatch reviewer lanes in parallel, not one-by-one |
| Sequential dispatch | Start reviewer lanes concurrently instead of one-by-one |
| Failing approach deviations | Approach deviations are INFORMATIONAL if outcome matches |
| Binary pass/fail | Use completion matrix with DONE/PARTIAL/MISSING/DEVIATED |
| Ignoring WIP state | Report current state accurately, don't require 100% completion |
| Skipping synthesis | Raw agent output isn't the deliverable - synthesize |
| Ending after beads creation | If issues created, MUST ask if user wants to implement now |
| Assuming bd sync is always required | Only run sync if your environment requires it |
| Recommending later-phase work | Check epic/sibling issues before recommending - don't bring forward work already scoped later |
| Skipping Review All option | Always offer fast-track first - only show detailed questions if user picks Customize |
| **Not disambiguating epics** | If multiple epics match (e.g., multiple "Phase 6"), ask user which one |
| **Not pre-reading beads issues** | Always pre-read with `bd show` and include in all agent prompts |
| **Making technical assumptions** | Don't assume how code works - READ it and quote specific lines |
| **Silent rate limit fallback** | If any agent fails, NOTIFY user explicitly before proceeding with remaining agents |
| **Modifying files during review** | Review phase is READ-ONLY; changes come later |
| **Premature timeout** | Use 900000ms (15 min) timeout for all agents - don't give up after 2-5 minutes |
| **Unquoted special paths** | Always single-quote paths with `()`, `[]`, or spaces |
| **Treating sandbox stderr as errors** | Homebrew/profile errors in stderr are ignorable - check exit codes instead |
| **Sequential pre-flight checks** | Run Claude and Gemini pre-flight checks IN PARALLEL, not sequentially |
| **Gemini file modifications** | Gemini runs unsandboxed - prompt explicitly prohibits file modifications during review |
| **Inline Gemini HEREDOC** | Use TWO-STEP temp file approach - write prompt to file first, then call gemini |
| **Sequential result collection** | Collect all reviewer lanes concurrently before synthesis |
| **Stopping after first wait cycle** | Use `awaiter` subagent and continue polling until all lanes finish/fail |
| **Extra exploration after collection** | Proceed IMMEDIATELY to synthesis - don't supplement with your own reads |
| **Skipping change verification** | After applying changes, re-read files and summarize what changed |
| **Table cell overflow** | Keep completion matrix cells under 30 chars - use status shorthand |
