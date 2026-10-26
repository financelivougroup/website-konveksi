# Claude Instructions — Website Konveksi

This project is a **Production Monitoring Dashboard** for a garment manufacturing (konveksi) business. It tracks orders through a 5-phase production pipeline: Planning → Cutting → Sewing → Finishing → Invoicing.

## Before Making Any Changes

1. **Read `project.md` first** — start with its current overview and latest progress; dated older entries are history, not all current instructions.
2. **Read `CONTEXT.md` and `GLOSSARY.md`** before domain work, then relevant decisions from `docs/adr/README.md`. Follow `docs/agents/domain.md` when updating these documents.
3. Check `docs/README.md`, `docs/superpowers/specs/`, and `docs/superpowers/plans/` for relevant design history and implementation plans; check supersession notes before applying old requirements.

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

- **Follow the existing architecture** — mirror the pattern of whichever sibling module already does the same kind of thing; don't introduce a parallel structure.
- **Reuse existing components** — check `src/components/` before creating anything new. The project has 50+ shadcn/ui components, modals (FilterModal, SortModal, etc.), a DataTable, Sidebar, TopBar, Toolbar, etc.
- **Keep modals inline or use ModalShell** — modal patterns should match existing ones in `src/components/Modals/ModalShell.tsx`.
- **Use the existing type system** — types are in `src/types/index.ts` (view config, filters, etc.) and `src/types/pipeline.ts` (production pipeline types).
- **Use the existing data boundaries** — `src/data/` contains static view configuration, fixtures, and shared helpers; persistent application data is accessed through the Supabase-backed service layer in `src/services/`. Do not reintroduce direct in-memory mutation for persistent records.
- **Tailwind CSS + shadcn/ui** — use the existing Tailwind config and shadcn/ui components. The theme uses CSS variables with a slate base color.

## UI Components — shadcn MANDATORY (no exceptions)

**Every time a UI component is needed, shadcn/ui is MANDATORY.** This is a hard rule, not a guideline:

1. **First**, check `src/components/ui/` and `src/components/` for an existing shadcn-based component (the project has 50+). Reuse it if it exists.
2. **If it does not exist**, use the installed **shadcn MCP** to browse the registry and install the component, adapting it to the project's New York / slate theme.
3. **Building a custom component from scratch is only allowed** when the registry genuinely has nothing suitable AND the behavior is application-specific. The reason must be stated explicitly before implementing, and shadcn primitives must still be used for the base (Dialog, Button, Input, etc.).
4. If shadcn MCP is unavailable, disconnected, or awaiting authorization, **STOP before creating the component and ask the user to activate or authorize it**. Do not silently substitute a hand-rolled component.

## Database Operations — Supabase MCP Required

- **Deployment note (verified 2026-10-22):** the application's `.env` and the Supabase MCP in `.mcp.json` currently target the same **Supabase cloud project**; running Vite/Worker locally does not make the database local. Local or cloud deployment is acceptable. **Always use Supabase MCP** as the database-operation interface, inspect the configured target before database work, and never switch environments or bypass MCP with ad-hoc SQL clients as a side effect of documentation work.
- For every task that touches the database — including schema inspection, queries, migrations, tables, columns, constraints, indexes, RLS policies, database functions, triggers, or production data — **use Supabase MCP before proposing or applying changes**.
- Inspect the current schema and relevant existing objects through Supabase MCP first. Do not infer the live database state only from TypeScript types, service files, documentation, or old migration files.
- Do not write or execute assumption-based SQL without first obtaining the applicable schema context through Supabase MCP. SQL migration files may still be created when needed, but their contents must be based on the MCP-verified current schema.
- Use the existing migration and service-layer conventions after verification; do not bypass `src/services/` for application data access.
- If Supabase MCP is unavailable, disconnected, or awaiting authorization, **stop the database task and ask the user to activate or authorize it**. Do not silently fall back to manual SQL or guess the schema.

## Product Design Direction

### Figma approval before UI implementation

For every task that adds or changes a design/UI (including layout, dialogs, typography, colors, or component presentation):

1. Prepare or update the proposed design in **Figma** using the applicable Figma skills and existing shadcn/ReUI design system. Use the user's designated file; if no destination is known, ask for it before writing to Figma.
2. Share the Figma file/frame link for review and **wait for the user's explicit approval of that design**.
3. Implement only the approved design in application code. A request to design something, an existing Figma connection, or approval of another task does not replace this approval.

If Figma is disconnected or requires authorization, pause the design workflow and ask the user to connect/authorize it; do not substitute a code-first implementation or another preview destination. This gate applies to design/UI work, not unrelated backend logic, tests, or documentation maintenance. The user may explicitly waive the gate for a particular task.

- Treat this product primarily as a **SaaS operations dashboard**, not as a marketing landing-page project. Prioritize information hierarchy, operational clarity, compact data presentation, predictable interactions, and consistency with the existing dashboard.
- Do not invoke or apply skills, rules, or styling guidance made specifically for landing pages or marketing sites when designing dashboard screens. Only use landing-page-specific guidance when the user explicitly asks to work on a marketing or landing page.

## Session Memory — supermemory SUDAH DIHAPUS (2026-09-07)

- **supermemory telah di-uninstall seluruhnya atas permintaan user**: plugin `supermemory@supermemory-plugins`, marketplace-nya, dua env (`SUPERMEMORY_CC_API_KEY`, `SUPERMEMORY_API_URL`), dan folder data `.supermemory/` (263 MB) semuanya sudah dihapus.
- **Jangan pasang kembali tanpa diminta.** Bila sesi lain masih melihat perangkat memori supermemory, itu sisa proses lama — bukan tanda harus dipasang ulang.
- Catatan lama di bawah ini ("cloud version must NEVER be used") sudah tidak berlaku karena tidak ada lagi supermemory di proyek ini. Bila kelak dipasang lagi, aturan **LOCAL / self-hosted saja** (`http://localhost:6767`) dan larangan memakai `mcp.supermemory.ai` berlaku kembali.

## Agent skills

### Issue tracker

Issues are tracked as local Markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Domain docs

This repository uses a single-context domain documentation layout. See `docs/agents/domain.md`.

### Default feature-delivery workflow

Invoking `/grill-with-docs` authorizes continuing that feature through the whole
delivery sequence — grill → spec → tickets → implement. Invoke the
`feature-delivery` skill for the sequence and its checkpoints.

## At the End of Every Completed Task

Update the **"Latest Progress"** section in `project.md` so future Claude sessions can understand the current project status without starting from scratch.
