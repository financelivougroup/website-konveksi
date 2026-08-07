-- supabase/migrations/2026-08-06-target-jahit-subsystem.sql
-- Target Jahit subsystem: planning, detail, complain tables.
-- Applied to the live DB via Supabase MCP; this file is the repo record.

-- planning_produksi: rencana per staf per produk untuk periode target
CREATE TABLE IF NOT EXISTS public.planning_produksi (
  id            BIGSERIAL PRIMARY KEY,
  nama_penjahit TEXT    NOT NULL,
  product       TEXT    NOT NULL,
  warna         TEXT,
  qty           INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  bulan_target  TEXT    NOT NULL,                 -- format "2026-08"
  status        TEXT    NOT NULL DEFAULT 'draft', -- draft | final
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pp_bulan_target ON public.planning_produksi(bulan_target);

-- target_jahit_detail: realisasi per desain per orang per bulan (child)
CREATE TABLE IF NOT EXISTS public.target_jahit_detail (
  id              BIGSERIAL PRIMARY KEY,
  target_jahit_id INTEGER NOT NULL,
  product         TEXT    NOT NULL,
  warna           TEXT,
  qty_target      INTEGER NOT NULL DEFAULT 0,
  qty_realisasi   INTEGER NOT NULL DEFAULT 0,
  harga_jahit     NUMERIC NOT NULL DEFAULT 0,
  harga_obras     NUMERIC NOT NULL DEFAULT 0,
  FOREIGN KEY (target_jahit_id) REFERENCES public.target_jahit(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tjd_target ON public.target_jahit_detail(target_jahit_id);

-- complain_penalti: pencatatan complain + potongan + poin
CREATE TABLE IF NOT EXISTS public.complain_penalti (
  id               BIGSERIAL PRIMARY KEY,
  tanggal          DATE    NOT NULL,
  product          TEXT    NOT NULL,
  warna            TEXT,
  pcs              INTEGER NOT NULL DEFAULT 1,
  posisi           TEXT    NOT NULL,              -- jahit | obras | finishing | kancing
  pic              TEXT,
  detail_complain  TEXT,
  potongan_per_pcs NUMERIC NOT NULL DEFAULT 0,
  poin             INTEGER NOT NULL DEFAULT 0,
  bukti_url        TEXT,
  input_by         TEXT,                         -- customer service (display name)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cp_pic ON public.complain_penalti(pic);

-- Note: complain_penalti.pic intentionally has no FK to register_penjahit;
-- that table may be empty and names are free-text.

-- RLS: the app runs behind the auth gate, so only the authenticated role
-- needs access. Debt/salary restriction is enforced at the service layer
-- per the approved design; these tables carry production/planning/complain
-- data visible to all logged-in roles.
ALTER TABLE public.planning_produksi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated planning read"
  ON public.planning_produksi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated planning insert"
  ON public.planning_produksi FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated planning update"
  ON public.planning_produksi FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated planning delete"
  ON public.planning_produksi FOR DELETE TO authenticated USING (true);

ALTER TABLE public.target_jahit_detail ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated target detail read"
  ON public.target_jahit_detail FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated target detail insert"
  ON public.target_jahit_detail FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated target detail update"
  ON public.target_jahit_detail FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated target detail delete"
  ON public.target_jahit_detail FOR DELETE TO authenticated USING (true);

ALTER TABLE public.complain_penalti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated complain read"
  ON public.complain_penalti FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated complain insert"
  ON public.complain_penalti FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated complain update"
  ON public.complain_penalti FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated complain delete"
  ON public.complain_penalti FOR DELETE TO authenticated USING (true);