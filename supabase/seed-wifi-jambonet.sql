-- Replace all WiFi packages with updated Jambonet offerings
-- First clear existing data
DELETE FROM public.wifi_package_categories;
DELETE FROM public.wifi_packages;

-- Insert new packages
INSERT INTO public.wifi_packages (name, provider, speed, price, description, features, original_price) VALUES
(
  'Home Lite', 'Jambonet', '20Mbps', 1500,
  'Affordable home internet for light browsing and streaming.',
  ARRAY['Unlimited Internet access', '20Mbps internet Speed', 'E-learning & online meetings', 'HD Video streaming', 'CCTV Live Stream'],
  3000
),
(
  'Home Lite', 'Jambonet', '30Mbps', 1800,
  'Great for families who stream and work from home.',
  ARRAY['Unlimited Internet access', '30Mbps internet Speed', 'E-learning & online meetings', 'HD Video streaming', 'CCTV Live Stream'],
  4000
),
(
  'Home', 'Jambonet', '50Mbps', 2250,
  'Our most popular plan. Perfect for 4K streaming and video conferencing.',
  ARRAY['Unlimited Internet access', '50Mbps internet Speed', 'Video Conferencing & meetings', 'Ultra 4K HD Video streaming', 'CCTV Live Stream'],
  5300
),
(
  'Home Plus', 'Jambonet', '60Mbps', 3000,
  'Top-tier speed for power users and 8K entertainment.',
  ARRAY['Unlimited Internet access', '60Mbps internet Speed', 'Video Conferencing & meetings', 'Ultra 8K HD Video streaming', 'CCTV Live Stream'],
  4000
),
(
  'UNLIMITED 1 DEVICE', 'Jambonet', 'High Speed', 700,
  'Perfect for a single device on the go.',
  ARRAY['Unlimited Internet access', 'High internet Speed', 'E-learning & online meetings', 'Stream, Browse & Work', 'Secure Connection'],
  1000
),
(
  'UNLIMITED 2 DEVICE', 'Jambonet', 'High Speed', 1000,
  'Share fast internet across two devices.',
  ARRAY['Unlimited Internet access', 'High internet Speed', 'Share with an extra Device', 'Stream, Browse & Work', 'Secure Connection'],
  1300
),
(
  'UNLIMITED 3 DEVICE', 'Jambonet', 'High Speed', 1300,
  'Connect your whole household with one plan.',
  ARRAY['Unlimited Internet access', 'High internet Speed', 'Share with 2 extra Devices', 'Stream, Browse & Work', 'Perfect for Household devices'],
  1650
);

-- Map: category name -> (names of packages that belong, best_seller package name)
WITH cat_data AS (
  SELECT id, name FROM public.wifi_categories
)
INSERT INTO public.wifi_package_categories (package_id, category_id, best_seller)
SELECT p.id, c.id,
  CASE
    WHEN c.name = 'Home Packages' AND p.name = 'Home' AND p.speed = '50Mbps' THEN true
    WHEN c.name = 'Device Plans' AND p.name = 'UNLIMITED 2 DEVICE' THEN true
    ELSE false
  END
FROM public.wifi_packages p
CROSS JOIN public.wifi_categories c
WHERE
  (c.name = 'Home Packages' AND p.name IN ('Home Lite', 'Home', 'Home Plus'))
  OR
  (c.name = 'Device Plans' AND p.name LIKE 'UNLIMITED%')
ON CONFLICT DO NOTHING;
