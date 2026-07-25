-- supabase/migrations/2026-07-23-target-jahit.sql

-- ============================================================
-- Target Jahit table — production targets & performance tracking
-- for sewing operators (penjahit).
-- ============================================================

CREATE TABLE IF NOT EXISTS target_jahit (
  id                           BIGSERIAL PRIMARY KEY,
  bulan_tahun                  TEXT    NOT NULL,                       -- e.g. "Juli 2026"
  nama                         TEXT    NOT NULL,                       -- operator name
  posisi                       TEXT,                                   -- e.g. "Penjahit", "Leader"
  salary                       NUMERIC NOT NULL DEFAULT 0 CHECK (salary >= 0),
  total_hari_kerja             INTEGER NOT NULL DEFAULT 0 CHECK (total_hari_kerja >= 0),
  hari_kerja_hari_ini          INTEGER NOT NULL DEFAULT 0 CHECK (hari_kerja_hari_ini >= 0),
  sisa_hari                    INTEGER NOT NULL DEFAULT 0 CHECK (sisa_hari >= 0),
  target_daily                 NUMERIC NOT NULL DEFAULT 0,
  target_ngebut_hari           NUMERIC NOT NULL DEFAULT 0,
  target_monthly               NUMERIC NOT NULL DEFAULT 0,
  realisasi_monthly            NUMERIC NOT NULL DEFAULT 0,
  sisa_target_monthly          NUMERIC NOT NULL DEFAULT 0,
  progress_monthly             NUMERIC NOT NULL DEFAULT 0,
  status_final                 TEXT,
  target_cost_posisi           NUMERIC NOT NULL DEFAULT 0,
  realisasi_cost_posisi        NUMERIC NOT NULL DEFAULT 0,
  target_accum                 NUMERIC NOT NULL DEFAULT 0,
  realisasi_accum              NUMERIC NOT NULL DEFAULT 0,
  selisih_accum                NUMERIC NOT NULL DEFAULT 0,
  target_ngebut_hari_akumulasi NUMERIC NOT NULL DEFAULT 0,
  progress_accum               NUMERIC NOT NULL DEFAULT 0,
  status_final_akumulasi       TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_target_jahit_bulan_tahun ON target_jahit(bulan_tahun);
CREATE INDEX IF NOT EXISTS idx_target_jahit_nama         ON target_jahit(nama);
CREATE INDEX IF NOT EXISTS idx_target_jahit_posisi       ON target_jahit(posisi);

-- Unique constraint: one row per operator per month
CREATE UNIQUE INDEX IF NOT EXISTS idx_target_jahit_unique
  ON target_jahit(bulan_tahun, nama);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_target_jahit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_target_jahit_updated_at ON target_jahit;
CREATE TRIGGER trg_target_jahit_updated_at
  BEFORE UPDATE ON target_jahit
  FOR EACH ROW EXECUTE FUNCTION update_target_jahit_updated_at();
