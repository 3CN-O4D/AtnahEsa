-- Add best_seller column to the junction table so each category can have one best-seller package
ALTER TABLE public.wifi_package_categories ADD COLUMN IF NOT EXISTS best_seller BOOLEAN NOT NULL DEFAULT false;
