# Flexible hunter/lister roles

One account can now be a **hunter**, a **lister**, or **both**.

## What changed

- Signup and profile use checkboxes for hunter/lister; both may be selected.
- A signed-up email is no longer an error. Signing up again with the same email
  adds the selected role to the existing account after the signup OTP is
  verified, instead of showing “user already registered”.
- Users can edit their role selection in **Profile → Edit**, confirmed by an
  email OTP. Admin accounts cannot be downgraded through this flow.
- Every signed-in account can hunt and list; roles are a preference/label, so
  listers can book and hunters can list.
- Password policy: at least 6 characters with uppercase, lowercase and a number.

## Required Supabase migration

Run [`supabase/flexible-user-roles.sql`](../supabase/flexible-user-roles.sql) in
the Supabase SQL Editor. It:

- adds `both` to the allowed `profiles.role` values,
- stores a `roles` array in `auth.users.user_metadata`,
- allows users to change their own role between hunter/lister/both after OTP,
- keeps admin-only role changes restricted,
- lets broadcast notifications reach users selected as both.

Until the migration is run, the app stores `hunter` in the legacy role column
when both are selected; the `roles` metadata array still records the user's real
selection, so signup and profile updates will not fail.

After the migration, run `supabase/sync-roles-to-metadata.sql` once to backfill
JWT metadata for existing accounts.
