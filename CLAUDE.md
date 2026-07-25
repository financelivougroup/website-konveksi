# Claude Instructions — Website Konveksi

This project is a **Production Monitoring Dashboard** for a garment manufacturing (konveksi) business. It tracks orders through a 5-phase production pipeline: Planning → Cutting → Sewing → Finishing → Invoicing.

## Before Making Any Changes

1. **Read `project.md` first** — it contains the full project overview, tech stack, completed features, pending tasks, and latest progress log. Every Claude session must start by reading this file.
2. Check `docs/superpowers/specs/` and `docs/superpowers/plans/` for design specs and implementation plans relevant to your task.

## Delegation and Model Cost

- **Prefer cost-aware delegation without lowering quality** — delegate when a well-bounded subtask can be completed more cheaply or in parallel by a sufficiently capable model and its result can be objectively verified. Quality, correctness, and confidence always take priority over cost savings.
- **Choose the cheapest sufficiently capable model**, not simply the cheapest available model. Work directly when a small task only needs a handful of tool calls and delegation overhead would outweigh the benefit.
- Good delegation candidates include codebase searches, file discovery, independent-file summaries, inventories of call sites/types/services/components, mechanical transformations with explicit rules, initial documentation drafts, defined test scaffolding, and independent research tracks.
- Keep architecture and cross-module decisions, ambiguous product requirements, database/schema/migration/RLS work, security-sensitive changes, high-risk business or financial logic, final integration, conflict resolution, and completion claims with the main model. Database work remains subject to the mandatory Supabase MCP rules below.
- Every delegated brief must state the precise scope and exclusions, relevant project context, expected output, objective acceptance criteria, applicable MCP/project rules, edit permissions, and required verification evidence. Do not delegate vague tasks.
- Escalate to a stronger model or return the work to the main model when requirements become ambiguous, scope expands, findings conflict or lack evidence, substantial architectural/domain reasoning is needed, risk increases, or review overhead approaches the cost of doing the work directly.
- Treat delegated output as evidence, not authority. The main model must inspect the relevant result or diff, verify scope, run applicable build/tests/lint/type checks, use Supabase MCP for database claims, check cross-module integration where relevant, and report skipped or failed verification accurately.
- Avoid duplicate work and unnecessary agents: delegate only sizeable independent tracks, parallelize only genuinely independent work, do not re-derive accepted delegated work without a concrete verification concern, and keep the agent count proportional to the task.

## Architecture Rules

- **Follow the existing architecture** — the project has a clear pattern: pages in `src/pages/`, reusable layout components in `src/components/Layout/`, modals in `src/components/Modals/`, shadcn/ui primitives in `src/components/ui/`, types in `src/types/`, static view configuration and fixtures in `src/data/`, and Supabase data access in `src/services/`.
- **Reuse existing components** — check `src/components/` before creating anything new. The project has 50+ shadcn/ui components, modals (FilterModal, SortModal, etc.), a DataTable, Sidebar, TopBar, Toolbar, etc.
- **Keep modals inline or use ModalShell** — modal patterns should match existing ones in `src/components/Modals/ModalShell.tsx`.
- **Use the existing type system** — types are in `src/types/index.ts` (view config, filters, etc.) and `src/types/pipeline.ts` (production pipeline types).
- **Use the existing data boundaries** — `src/data/` contains static view configuration, fixtures, and shared helpers; persistent application data is accessed through the Supabase-backed service layer in `src/services/`. Do not reintroduce direct in-memory mutation for persistent records.
- **Tailwind CSS + shadcn/ui** — use the existing Tailwind config and shadcn/ui components. The theme uses CSS variables with a slate base color.

## Database Operations — Supabase MCP Required

This project uses **Supabase MCP** as the required database-operation interface.

- For every task that touches the database — including schema inspection, queries, migrations, tables, columns, constraints, indexes, RLS policies, database functions, triggers, or production data — **use Supabase MCP before proposing or applying changes**.
- Inspect the current remote schema and relevant existing objects through Supabase MCP first. Do not infer the live database state only from TypeScript types, service files, documentation, or old migration files.
- Do not write or execute assumption-based SQL without first obtaining the applicable schema context through Supabase MCP. SQL migration files may still be created when needed, but their contents must be based on the MCP-verified current schema.
- Use the existing migration and service-layer conventions after verification; do not bypass `src/services/` for application data access.
- If Supabase MCP is unavailable, disconnected, or awaiting authorization, **stop the database task and ask the user to activate or authorize it**. Do not silently fall back to manual SQL or guess the schema.

## UI Components — shadcn MCP Required

- Before creating UI, check `src/components/` and `src/components/ui/` for an existing reusable component.
- Whenever a task needs a UI component that is not already present, **use the installed shadcn MCP to browse the shadcn/ui registry and install the appropriate component**.
- If a standard shadcn/ui component exists, use and adapt it to the project's New York/slate theme instead of building a custom replacement from scratch.
- Creating a custom component from scratch is allowed only when the registry has no suitable standard component or when the required behavior is genuinely application-specific. State the reason before implementing it, and still reuse shadcn primitives where possible.
- If shadcn MCP is unavailable, disconnected, or awaiting authorization, **stop before creating the new component and ask the user to activate or authorize it**. Do not silently substitute a hand-rolled component.

## Product Design Direction

- Treat this product primarily as a **SaaS operations dashboard**, not as a marketing landing-page project. Prioritize information hierarchy, operational clarity, compact data presentation, predictable interactions, and consistency with the existing dashboard.
- Do not invoke or apply skills, rules, or styling guidance made specifically for landing pages or marketing sites when designing dashboard screens. This includes any `tasteskill`-like landing-page design rule if one is introduced later.
- Only use landing-page-specific guidance when the user explicitly asks to work on a marketing or landing page; do not let it influence dashboard modules by default.

## At the End of Every Completed Task

Update the **"Latest Progress"** section in `project.md` so future Claude sessions can understand the current project status without starting from scratch.
