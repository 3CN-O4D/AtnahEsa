-- Storage RLS: allow authenticated users to upload/list/read objects
-- Run this in Supabase SQL Editor

-- Allow authenticated users to upload files to any bucket
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to read files (signed URLs work regardless)
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to update their own uploads
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (auth.uid()::text = owner_id);

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (auth.uid()::text = owner_id);

-- Public read access for signed URLs to work for unauthenticated users (hunters)
CREATE POLICY "Allow public reads for signed URLs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id IN (SELECT name FROM storage.buckets WHERE public = false));
