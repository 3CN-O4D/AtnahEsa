# Google Sheet feed (AseHanta → Sheets)

AseHanta mirrors listing lifecycle events to a Google Apps Script web app. It is
strictly one-way: the site only POSTs; nothing is ever read back or shown in the
browser. The webhook URL and key live only in server environment variables.

## Server setup

Add to `.env` (and to your hosting provider's environment settings):

```
SHEET_WEBHOOK_URL=https://script.google.com/macros/s/.../exec
SHEET_WEBHOOK_KEY=<shared key>
```

`SHEET_WEBHOOK_KEY` is also in `.env.local.example` as a name only. Never commit
values. The site logs generic errors only; credentials are redacted.

## Payload

Every event POSTs a **full row snapshot** as JSON with `Content-Type: application/json`.
The original fields from the first integration are unchanged:

| Field | Meaning |
| --- | --- |
| `key` | `SHEET_WEBHOOK_KEY` |
| `websiteListingId` | Permanent listing UUID. Never changes. This is the upsert key. |
| `websiteLink` | `https://asehanta.com/listings/<uuid>` (uses `NEXT_PUBLIC_SITE_URL`) |
| `areaName` | Listing area (`listings.location`) |
| `propertyName` | Listing title |
| `location` | Descriptive location, falling back to area |
| `mapsLink` | Google Maps URL found in the description, otherwise `''` |
| `landlordName` | Lister name (form value or account name) |
| `phone` | Lister phone |
| `email` | Lister account email |
| `unitType` | One of `Single room`, `Bedsitter`, `Studio`, `1 Bedroom`, `2 Bedroom`, `3 Bedroom`, `4 Bedroom`, `Mabati`, `BnB`, `Other` |
| `rent` | Monthly rent in KES, number (no commas); falls back to booking fee |
| `deposit` | Deposit in KES, number |
| `dateAvailable` | `YYYY-MM-DD`; AseHanta has no "available from" field, so creation day is used |

### Lifecycle fields (need the updated Apps Script)

| Field | Meaning |
| --- | --- |
| `event` | `listing_created`, `listing_backfill`, `listing_status_changed`, `booking_paid`, `payout_approved`, `payout_released`, `refund_recorded`, `booking_cancelled` |
| `status` | Current `listings.status`: `pending`, `published`, `booked`, `taken`, `rejected` |
| `releaseStatus` | `house_bookings.release_status`: `pending`, `held`, `paid`, `refunded` |
| `bookingStatus` | `house_bookings.status` |
| `bookingId` | Latest booking UUID for the listing |
| `amountPaid` | Amount the hunter paid (KES) |
| `paymentReceipt` | Hunter's M-Pesa booking payment receipt |
| `payoutAmount` | Lister share approved or released (KES) |
| `payoutReceipt` | M-Pesa B2C receipt recorded by Treasury |
| `payoutDate` | Date the payout was recorded |
| `refundAmount` | Refund amount (KES) |
| `refundReceipt` | M-Pesa refund receipt |
| `refundDate` | Date the refund was recorded |
| `heldUntil` | When the 24h escrow hold ends |
| `paidAt` | When the hunter paid |
| `notes` | Human-readable reason for the event |

Not every event carries every lifecycle field: absent fields are omitted from
JSON. The script should treat a missing field as "leave this column unchanged"
on an update, or blank on a new row.

## Required Apps Script change

The current script returns `{ok:true,status:"duplicate"}` for an existing
`websiteListingId`. To reflect status and payout changes, replace its `doPost`
with the ready-to-paste implementation in
[`docs/google-apps-script.gs`](./google-apps-script.gs). It:

1. Parses `JSON.parse(e.postData.contents)`.
2. Verifies `data.key` against the `SHEET_WEBHOOK_KEY` Script Property.
3. Adds any missing lifecycle columns to the header row.
4. Updates the matching `websiteListingId` row using only fields present in the
   payload and returns `{ok:true,status:"updated"}`.
5. Appends a new row and returns `{ok:true,status:"added"}` when the ID is new.

Deploy it as a **new version** of the same web app so the URL stays unchanged.

Accepted success responses are `added`, `duplicate`, and `updated`. Anything
else (or `ok:false`) is retried up to 3 times with a delay. A final failure is
logged server-side and never blocks the user.

Because Google answers with a 302 redirect, the server uses `fetch` with the
default `redirect: "follow"` (fetch converts the redirected POST to GET). With
`curl`, use `-L -d ...` and **omit** `-X POST`, otherwise curl re-POSTs to the
redirect target and gets a 405.

## Events wired in the app

- New listing: public upload API, admin upload API, admin copilot.
- Status change: admin listing PATCH, lister status PATCH.
- Payment confirmed / escrow held: all PayWave, Tuma, manual-review and admin
  Treasury confirmation paths.
- Lister payout approved (viewing success or 24h auto-close) and payout recorded
  (real B2C SMS in Treasury).
- Hunter refund recorded in Treasury, plus legacy escrow release/refund.

## Backfill

```bash
npx tsx scripts/backfill-sheet-feed.ts --dry-run
npx tsx scripts/backfill-sheet-feed.ts
npx tsx scripts/backfill-sheet-feed.ts --limit 10
```

It reads every listing and the latest booking for each from Supabase and posts
one `listing_backfill` event per listing. It is safe to re-run.
