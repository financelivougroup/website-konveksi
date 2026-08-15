-- supabase/migrations/2026-08-15-complain-redesign.sql
-- Complain form redesign: cascade dropdown data, multi-photo evidence.
-- Applied via Supabase MCP; this file is the repo record.

-- complain_penalti: add work_code, tingkat, status; drop bukti_url
ALTER TABLE public.complain_penalti ADD COLUMN IF NOT EXISTS work_code TEXT;
ALTER TABLE public.complain_penalti ADD COLUMN IF NOT EXISTS tingkat TEXT;
ALTER TABLE public.complain_penalti ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Baru';
ALTER TABLE public.complain_penalti DROP COLUMN IF EXISTS bukti_url;

-- complain_files: file records per complain (max 3 enforced in the UI)
CREATE TABLE IF NOT EXISTS public.complain_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complain_id BIGINT NOT NULL REFERENCES public.complain_penalti(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_complain_files_complain ON public.complain_files(complain_id);
ALTER TABLE public.complain_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated complain files all"
  ON public.complain_files FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Public read complain files"
  ON public.complain_files FOR SELECT TO public USING (true);

-- Storage bucket complain-proofs (public) + policies for authenticated users
INSERT INTO storage.buckets (id, name, public)
VALUES ('complain-proofs', 'complain-proofs', true)
ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Authenticated upload complain proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'complain-proofs');
CREATE POLICY "Authenticated delete complain proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'complain-proofs');
