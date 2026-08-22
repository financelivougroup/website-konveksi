-- Add column to distinguish national vs manual holidays
ALTER TABLE public.daftar_libur ADD COLUMN is_national BOOLEAN DEFAULT FALSE;

-- Update existing rows if any are marked as national
UPDATE public.daftar_libur SET is_national = TRUE WHERE keterangan ILIKE '%nasional%';
