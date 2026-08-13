-- supabase/migrations/2026-08-13-finishing-input-by.sql
-- Add input_by to finishing_records so manual finishing entries are audited
-- (mirrors cutting_records.input_by / sewing_records.input_by).
-- Applied to the live DB via Supabase MCP; this file is the repo record.

ALTER TABLE public.finishing_records ADD COLUMN IF NOT EXISTS input_by TEXT;