-- supabase/migrations/2026-08-09-kanban-5-status-normalize.sql
-- Normalize work_orders.prod_status from the legacy 6-state to the new
-- 5-state ProductionStatus (NEW/CUTTING/PROGRESS/FINISHED/INVOICED).
-- Applied to the live DB via Supabase MCP; this file is the repo record.

UPDATE public.work_orders SET prod_status='CUTTING'  WHERE prod_status='CUTTING_COMPLETE';
UPDATE public.work_orders SET prod_status='NEW'      WHERE prod_status='CUTTING_PENDING';
UPDATE public.work_orders SET prod_status='PROGRESS' WHERE prod_status IN ('SEWING_IN_PROGRESS','FINISHING_IN_PROGRESS');
UPDATE public.work_orders SET prod_status='FINISHED' WHERE prod_status='FINISHING_COMPLETE';

-- Note: 'INVOICED' already valid in both. No legacy value left after this.
-- (Live run: all rows became FINISHED; verified via SELECT group by.)