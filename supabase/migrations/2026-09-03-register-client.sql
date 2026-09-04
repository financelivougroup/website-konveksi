-- supabase/migrations/2026-09-03-register-client.sql
-- Register Client: master data klien (brand) yang dipakai modul Invoicing.
-- Diterapkan via Supabase MCP (migration record: register_client_module).

CREATE TABLE IF NOT EXISTS public.register_client (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nama_client   text        NOT NULL,
  kode_client   text        NOT NULL,
  status        text        NOT NULL DEFAULT 'Aktif',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Nama dan kode klien harus unik (case-insensitive setelah trim).
CREATE UNIQUE INDEX IF NOT EXISTS register_client_nama_client_key
  ON public.register_client (lower(btrim(nama_client)));
CREATE UNIQUE INDEX IF NOT EXISTS register_client_kode_client_key
  ON public.register_client (lower(btrim(kode_client)));

-- RLS: read untuk semua (pola register_penjahit),
-- tulis hanya untuk authenticated (pola planning_produksi).
ALTER TABLE public.register_client ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read for all" ON public.register_client;
CREATE POLICY "Allow read for all"
  ON public.register_client FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Authenticated client insert" ON public.register_client;
CREATE POLICY "Authenticated client insert"
  ON public.register_client FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated client update" ON public.register_client;
CREATE POLICY "Authenticated client update"
  ON public.register_client FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated client delete" ON public.register_client;
CREATE POLICY "Authenticated client delete"
  ON public.register_client FOR DELETE
  TO authenticated
  USING (true);

GRANT SELECT ON public.register_client TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.register_client TO authenticated;

-- Seed awal mengikuti CLIENT_CODE_MAP di src/lib/invoiceCode.ts.
INSERT INTO public.register_client (nama_client, kode_client, status)
VALUES ('Livou', 'LVU', 'Aktif'), ('Cassca', 'CSC', 'Aktif')
ON CONFLICT DO NOTHING;
