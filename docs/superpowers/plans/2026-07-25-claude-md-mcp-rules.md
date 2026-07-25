# CLAUDE.md MCP Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the project instructions so database work must use Supabase MCP, new UI components must use shadcn MCP, and SaaS dashboard work is not steered by landing-page-specific design skills.

**Architecture:** Make an incremental documentation-only update to the existing `CLAUDE.md`, preserving valid architecture and workflow rules. Record the completed instruction change in `project.md`; do not remove any skill or source file because the repository-wide search found no `tasteskill` installation or reference.

**Tech Stack:** Claude Code project instructions, Supabase MCP, shadcn MCP, Markdown

## Global Constraints

- Preserve the existing `CLAUDE.md`; do not replace it from scratch.
- Supabase MCP and shadcn MCP are fail-closed: if unavailable or unauthorized, stop and ask the user to activate them.
- Do not remove ordinary landing-page application code.
- Do not delete `.superpowers` artifacts because they are not the requested skill.
- Do not create a git commit.
- Show the exact `CLAUDE.md` diff for user review before final confirmation.

---

### Task 1: Strengthen project instructions

**Files:**
- Modify: `CLAUDE.md:1-21`

**Interfaces:**
- Consumes: Existing architecture rules and project MCP configuration.
- Produces: Explicit database, UI-component, and product-design instructions for future Claude Code sessions.

- [ ] **Step 1: Preserve the existing introduction and pre-change checklist**

Keep the project identity and mandatory `project.md`/spec/plan reading rules unchanged.

- [ ] **Step 2: Correct stale Supabase architecture wording**

Replace the claim that all data is mock and Supabase is only planned with wording that distinguishes static view/mock fixtures from the active Supabase-backed service layer and migrations.

- [ ] **Step 3: Add mandatory Supabase MCP rules**

Require schema inspection through Supabase MCP before schema/query/migration/policy/function/trigger/data work; prohibit assumption-based SQL; require stopping for MCP activation when unavailable.

- [ ] **Step 4: Add mandatory shadcn MCP rules**

Require checking existing components first, browsing/installing registry components through shadcn MCP when a new component is needed, and documenting why a custom component is necessary only when no suitable registry component exists.

- [ ] **Step 5: Add SaaS dashboard design direction**

State that dashboard work must prioritize dense operational clarity and must not invoke landing-page/marketing-site-specific design skills or rules unless the task explicitly targets a marketing page.

- [ ] **Step 6: Review the instruction file**

Confirm the file still contains the existing architecture and progress-update rules and contains no claim that `tasteskill` was removed.

### Task 2: Record progress and present the diff

**Files:**
- Modify: `project.md:193-199`

**Interfaces:**
- Consumes: The completed instruction update and repository search result.
- Produces: A dated progress entry and a reviewable before/after diff.

- [ ] **Step 1: Add a Latest Progress entry**

Add a `2026-07-25` entry describing the Supabase MCP rule, shadcn MCP rule, fail-closed behavior, and the verified absence of `tasteskill`.

- [ ] **Step 2: Generate an exact diff**

Compare the preserved pre-edit `CLAUDE.md` content with the edited file so the user can review only the intended changes even though the file is currently untracked.

- [ ] **Step 3: Report scope faithfully**

State that no skill or application file was deleted, no commit was created, and MCP configuration itself was not changed.
