# AseHanta Development Guide

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Build for production
- `npm run lint` — Run ESLint

## Project Structure
- `src/app/` — Next.js App Router pages
- `src/components/` — Reusable React components
- `src/lib/` — Library code (Supabase, Cloudinary, Daraja, utils)
- `src/types/` — TypeScript type definitions
- `supabase/schema.sql` — Full database schema

## TODOs (search for `TODO` in codebase)
1. **Cloudinary upload**: Replace placeholder image upload with actual Cloudinary unsigned upload in `ImageUploader.tsx` and `upload/page.tsx`
2. **Admin role check**: Implement admin role verification in `admin/page.tsx` and `api/admin/listings/[id]/route.ts`
3. **Signup flow**: Wire up the signup API in `auth/signup/page.tsx`
4. **.env.local**: Create from `.env.local.example` with actual Supabase + Cloudinary + Daraja keys
5. **Seed data**: Add admin mover/WiFi management UI or seed via Supabase dashboard
6. **Supabase types**: Run `npx supabase gen types typescript --linked > src/types/supabase.ts`
7. **Email notifications**: Notify admin on new listings/contact submissions
8. **Admin role check**: Implement admin role verification in `admin/page.tsx` and `api/admin/listings/[id]/route.ts`
9. **Daraja revert (Monday)**: `src/lib/daraja.ts` has M-Pesa logic commented out (site inoperative). Uncomment to restore STK push / B2C refunds.
10. **Auto-delete cron**: Run `supabase/migration-taken-whatsapp.sql` on live DB, then schedule the cleanup job with pg_cron.

## Key Features
- Infinite scroll listing grid (IntersectionObserver)
- Slideshow for listing images
- OTP auth (email or phone via Supabase)
- Admin review/edit/publish workflow
- 30/70 revenue split (platform 30%, lister 70%)
- M-Pesa Daraja STK push payment integration (⚠️ temporarily commented out)
- Manual payment verification via M-Pesa message (⚠️ temporarily commented out)
- WhatsApp booking fallback while payments are being set up
- Taken listings shown publicly with TAKEN badge, auto-deleted after 24h
- Empty-state marketing: all houses taken → Request a House + WiFi packages
- Booked listing workflow (admin calls, arranges visit)
- 40/60 refund split (platform retains 40%, refunds 60%)
- Transaction logging and PDF reports
- User management (hunter/lister roles)
- Admin dashboard with stats
- Separate pages for Movers, WiFi, Contact