ALTER TABLE listings ADD COLUMN IF NOT EXISTS tiktok_url TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS tiktok_urls TEXT[] DEFAULT '{}';

UPDATE listings SET tiktok_urls = ARRAY[tiktok_url] WHERE tiktok_url IS NOT NULL AND tiktok_url != '' AND (tiktok_urls IS NULL OR array_length(tiktok_urls, 1) IS NULL OR tiktok_urls = '{}');
