-- supabase/migrations/2026-08-13-finishing-kancing-logs.sql
-- Finishing Log + Pasang Kancing Log support. Applied via Supabase MCP;
-- this file is the repo record.

-- finishing_records: PIC + bukti columns, plus write policies (it only had SELECT).
ALTER TABLE public.finishing_records ADD COLUMN IF NOT EXISTS pic_finishing TEXT;
ALTER TABLE public.finishing_records ADD COLUMN IF NOT EXISTS image_name TEXT;
CREATE POLICY "Allow authenticated all on finishing_records"
  ON public.finishing_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon all on finishing_records"
  ON public.finishing_records FOR ALL TO anon USING (true) WITH CHECK (true);

-- kancing_records: manual button-hole + button-sew reports (separate from sewing).
CREATE TABLE IF NOT EXISTS public.kancing_records (
  id             TEXT PRIMARY KEY,
  work_order_id  TEXT NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  work_code      TEXT,
  pic_kancing    TEXT NOT NULL,
  qty_kancing    INTEGER NOT NULL CHECK (qty_kancing > 0),
  tgl_laporan    DATE NOT NULL,
  input_by       TEXT,
  input_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  image_url      TEXT,
  image_name     TEXT
);
CREATE INDEX IF NOT EXISTS idx_kancing_records_wo ON public.kancing_records(work_order_id);
ALTER TABLE public.kancing_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on kancing_records"
  ON public.kancing_records FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated all on kancing_records"
  ON public.kancing_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow read for all"
  ON public.kancing_records FOR SELECT TO public USING (true);

-- Also recorded in 2026-08-13-finishing-input-by.sql: finishing_records.input_by TEXT.
