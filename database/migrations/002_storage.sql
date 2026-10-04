-- ============================================================
-- GasBack — Migration 002: private receipt bucket
-- Run in the Supabase SQL editor (needs the built-in `storage` schema).
--
-- Receipt photos are personal data. The bucket is PRIVATE: nobody can fetch an
-- image by URL. Users may upload and read only inside their own "<user_id>/" folder;
-- the server reads images with the service role when scanning.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipt-uploads', 'receipt-uploads', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif'];

DROP POLICY IF EXISTS "receipt_upload_own_folder" ON storage.objects;
CREATE POLICY "receipt_upload_own_folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipt-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "receipt_read_own_folder" ON storage.objects;
CREATE POLICY "receipt_read_own_folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipt-uploads' AND (storage.foldername(name))[1] = auth.uid()::text);
