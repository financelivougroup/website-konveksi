-- supabase/migrations/2026-08-15-register-penjahit-posisi.sql
-- Register Karyawan Tim Jahit: posisi kolom. Applied via Supabase MCP;
-- this file is the repo record.

ALTER TABLE public.register_penjahit ADD COLUMN IF NOT EXISTS posisi TEXT;
