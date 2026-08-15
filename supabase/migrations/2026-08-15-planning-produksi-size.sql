-- supabase/migrations/2026-08-15-planning-produksi-size.sql
-- Planning Produksi gains a size column (one planning row = penjahit +
-- product + warna + size + qty). Applied via Supabase MCP; repo record.

ALTER TABLE public.planning_produksi ADD COLUMN IF NOT EXISTS size TEXT;
