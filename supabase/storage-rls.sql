-- Storage RLS: secure by default
-- Run this in Supabase SQL Editor

-- 1. Public buckets: read-only for everyone (listing images, etc.)
--    Only bucket owner/service role can write
CREATE POLICY "Public buckets read only"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id IN (
    SELECT name FROM storage.buckets WHERE public = true
  )
);

-- 2. Authenticated users can read objects in non-public buckets they own
CREATE POLICY "Authenticated read own objects"
ON storage.objects FOR SELECT
TO authenticated
USING (auth.uid()::text = owner_id);

-- 3. Authenticated users can insert into specific buckets only (videos/avatars)
CREATE POLICY "Authenticated insert videos/avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('asehanta', 'avatars')
  AND (auth.uid()::text = owner_id)
);

-- 4. Authenticated users can update/delete their own objects
CREATE POLICY "Authenticated update own objects"
ON storage.objects FOR UPDATE
TO authenticated
USING (auth.uid()::text = owner_id);

CREATE POLICY "Authenticated delete own objects"
ON storage.objects FOR DELETE
TO authenticated
USING (auth.uid()::text = owner_id);

-- 5. Service role has full access (bypasses RLS)
--    (implicit: service role key bypasses RLS entirely)
