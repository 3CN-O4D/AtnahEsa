-- Run this AFTER adding the columns:
-- ALTER TABLE public.wifi_packages 
-- ADD COLUMN IF NOT EXISTS original_price INTEGER DEFAULT 0,
-- ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'home' CHECK (category IN ('home', 'device'));

INSERT INTO public.wifi_packages (name, provider, speed, price, original_price, description, features, category) VALUES

-- Home Packages
('Home Lite', 'Jambonet', '20Mbps', 1500, 3000,
 'Affordable home internet for light browsing and streaming',
 ARRAY['Unlimited Internet access', '20Mbps internet Speed', 'E-learning & online meetings', 'HD Video streaming', 'CCTV Live Stream'],
 'home'),

('Home Lite', 'Jambonet', '30Mbps', 1800, 4000,
 'Perfect for households with moderate streaming needs',
 ARRAY['Unlimited Internet access', '30Mbps internet Speed', 'E-learning & online meetings', 'HD Video streaming', 'CCTV Live Stream'],
 'home'),

('Home', 'Jambonet', '50Mbps', 2250, 5300,
 'Fast internet for heavy streaming and video conferencing',
 ARRAY['Unlimited Internet access', '50Mbps internet Speed', 'Video Conferencing & meetings', 'Ultra 4K HD Video streaming', 'CCTV Live Stream'],
 'home'),

('Home Plus', 'Jambonet', '60Mbps', 3000, 4000,
 'Premium high-speed internet for the ultimate experience',
 ARRAY['Unlimited Internet access', '60Mbps internet Speed', 'Video Conferencing & meetings', 'Ultra 8K HD Video streaming', 'CCTV Live Stream'],
 'home'),

-- Device Plans
('Unlimited 1 Device', 'Jambonet', 'High Speed', 700, 1000,
 'Perfect for a single device user',
 ARRAY['Unlimited Internet access', 'High internet Speed', 'E-learning & online meetings', 'Stream, Browse & Work', 'Secure Connection'],
 'device'),

('Unlimited 2 Device', 'Jambonet', 'High Speed', 1000, 1300,
 'Share with an extra device for two users',
 ARRAY['Unlimited Internet access', 'High internet Speed', 'Share with an extra Device', 'Stream, Browse & Work', 'Secure Connection'],
 'device'),

('Unlimited 3 Device', 'Jambonet', 'High Speed', 1300, 1650,
 'Perfect for multiple household devices',
 ARRAY['Unlimited Internet access', 'High internet Speed', 'Share with 2 extra Devices', 'Stream, Browse & Work', 'Perfect for Household devices'],
 'device');
