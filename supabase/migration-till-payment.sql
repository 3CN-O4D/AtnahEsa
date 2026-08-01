-- ============================================================
-- Migration: Add mpesa_message to house_bookings (Till payment confirmation)
-- Run this in Supabase SQL Editor against the LIVE database.
-- ============================================================

ALTER TABLE public.house_bookings ADD COLUMN IF NOT EXISTS mpesa_message TEXT DEFAULT '';
