# Cost-Aware Delegation Policy Design

**Date:** 2026-07-25
**Status:** Approved and implemented in `CLAUDE.md`

## Purpose

Reduce AI development cost by delegating suitable work to cheaper capable models without lowering implementation quality, correctness, or verification standards.

The governing principle is:

> Delegate based on task risk and model capability, not price alone. The main model remains accountable for critical decisions, integration, and final verification.

## Policy Location

Add a new `## Delegation and Model Cost` section to `CLAUDE.md` immediately after `## Before Making Any Changes` and before `## Architecture Rules`.

## Delegation Strategy

Use risk-based delegation. Prefer a cheaper capable model when all of the following are true:

1. The subtask is well-bounded and independent.
2. Its expected output and acceptance criteria can be stated precisely.
3. Its result can be reviewed or verified objectively.
4. Delegation is expected to reduce total cost or elapsed time after accounting for briefing and review overhead.
5. A lower-cost model is sufficiently capable for the task.

Do not delegate merely because a cheaper model is available.

## Good Delegation Candidates

Tasks normally suitable for a cheaper capable model include:

- Broad codebase searches and file discovery
- Reading and summarizing independent files
- Inventorying call sites, types, tables, services, or components
- Mechanical and repetitive transformations with explicit rules
- Initial documentation drafts
- Test scaffolding when expected behavior is already defined
- Independent research tracks that can run in parallel

For a small task that the main model can complete in a handful of direct tool calls, work directly rather than paying the context and coordination overhead of a subagent.

## Main-Model Responsibilities

Keep the following work with the main model unless the delegated agent is clearly qualified and the main model still retains decision authority:

- Architecture and cross-module design decisions
- Ambiguous requirements and product decisions
- Database schema, migrations, constraints, RLS, database functions, triggers, and production-data operations
- Security-sensitive work
- High-risk business logic and financial calculations
- Final integration across delegated outputs
- Resolution of conflicting or uncertain delegated findings
- Final review, verification, and completion claims

Database work remains subject to the existing mandatory Supabase MCP rules regardless of delegation.

## Model Selection and Escalation

Choose the cheapest model that is sufficiently capable for the defined subtask, not the cheapest model available.

Escalate the subtask to a stronger model or bring it back to the main model when any of these conditions occur:

- Requirements are ambiguous or materially incomplete.
- The subtask expands beyond its original boundary.
- Findings are inconsistent, unsupported, or low confidence.
- The task requires substantial architectural or domain reasoning.
- The task becomes database-, security-, or production-sensitive.
- Review overhead is approaching or exceeding the cost of doing the task directly.

Model availability and relative pricing may change, so the policy should describe capability tiers and escalation behavior rather than hard-code one permanent model name for every task category.

## Delegation Brief Requirements

Every delegated task must include:

- A precise scope and explicit exclusions
- Relevant project context and file or subsystem boundaries
- The expected output format
- Objective acceptance criteria
- Applicable project rules, including Supabase MCP and shadcn MCP requirements
- Whether the agent may edit files or must remain read-only
- The verification evidence it should return

Do not delegate vague requests such as “improve this module” without defining what improvement means.

## Quality Gate

Delegated output is evidence, not authority. The main model must not trust it blindly.

Before accepting delegated work, the main model must perform verification appropriate to the task, which may include:

- Inspecting the relevant findings, files, or diff
- Confirming that the result stays within scope
- Running the build, tests, lint, and type checks that apply
- Using Supabase MCP to verify database claims or changes
- Checking integration behavior across affected modules
- Escalating uncertain findings rather than silently accepting them

The main model remains responsible for reporting verification failures or skipped checks accurately.

## Avoiding Wasteful Delegation

Delegation must reduce total cost or time rather than create duplicate work.

- Do not redo or independently re-derive delegated work unless verification finds a concrete problem.
- Do not launch multiple agents for one small task.
- Parallelize only genuinely independent, sizeable tracks.
- When multiple independent agents are useful, launch them concurrently.
- Give each agent a complete brief the first time; avoid repeated re-briefing.
- Keep the number of agents proportional to the task.

## Quality Priority

Quality takes priority over cost. Keep work on the main model when a cheaper model would materially increase the chance of:

- Defects or regressions
- Missed requirements
- Incorrect database assumptions
- Security issues
- Integration failures
- Significant review or rework

A cheaper first pass is useful only when the verification path is clear and the total workflow remains cheaper without reducing confidence.

## Expected `CLAUDE.md` Wording

The implementation should express the policy as concise operational bullets rather than copying this entire design document. It must preserve these mandatory ideas:

1. Prefer delegation when it saves cost without reducing quality.
2. Delegate only well-bounded and objectively verifiable tasks.
3. Choose the cheapest sufficiently capable model.
4. Keep critical decisions and final integration with the main model.
5. Escalate when ambiguity, risk, or reasoning requirements increase.
6. Require precise briefs and acceptance criteria.
7. Review delegated outputs and run applicable verification.
8. Avoid duplicate work and unnecessary agents.
9. Quality takes priority over cost.

## Acceptance Criteria

The policy implementation is accepted when:

- `CLAUDE.md` contains a dedicated delegation and model-cost section in the specified location.
- The section lists suitable and unsuitable delegation categories.
- The section requires capability-based model choice and escalation.
- The section requires main-model review and objective verification.
- The section prevents redundant delegation and excessive agent spawning.
- The section explicitly states that quality has priority over cost.
- Existing architecture, Supabase MCP, shadcn MCP, and project completion rules remain unchanged.
- `project.md` records the policy addition in Latest Progress.
