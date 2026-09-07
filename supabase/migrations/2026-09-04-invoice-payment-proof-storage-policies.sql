-- Allow authenticated users to manage invoice payment proofs.
-- The bucket is public for reads; uploads and deletes remain authenticated-only.

INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-payment-proofs', 'invoice-payment-proofs', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Authenticated upload invoice payment proofs" ON storage.objects;
CREATE POLICY "Authenticated upload invoice payment proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-payment-proofs');

DROP POLICY IF EXISTS "Authenticated delete invoice payment proofs" ON storage.objects;
CREATE POLICY "Authenticated delete invoice payment proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-payment-proofs');
