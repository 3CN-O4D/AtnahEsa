ALTER TABLE listings ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';
ALTER TABLE listings ADD COLUMN IF NOT EXISTS youtube_urls TEXT[] DEFAULT '{}';

UPDATE listings SET video_urls = ARRAY[video_url] WHERE video_url IS NOT NULL AND video_url != '' AND (video_urls IS NULL OR array_length(video_urls, 1) IS NULL OR video_urls = '{}');
UPDATE listings SET youtube_urls = ARRAY[youtube_url] WHERE youtube_url IS NOT NULL AND youtube_url != '' AND (youtube_urls IS NULL OR array_length(youtube_urls, 1) IS NULL OR youtube_urls = '{}');
