# Resort and Local Admin Roles Implementation

**Goal:** Add municipal oversight, barangay-scoped attraction operations, an
owner portal for resorts, and correctly routed attraction and resort requests.

**Architecture:** Keep the existing desktop Admin experience as the Municipal
Super Admin portal; add separate Barangay Admin and Resort Owner portals; add
approved resort discovery to the tourist experience. Supabase RLS and trusted
Edge Functions enforce role, ownership, approval, and booking boundaries.

**Spec:** [2026-11-06-resort-and-local-admin-roles-design.md](../specs/2026-11-06-resort-and-local-admin-roles-design.md)

## Agreed behavior

- Municipal Super Admins approve resort-owner accounts, provision Barangay
  Admins, oversee all areas, and can intervene in resort-listing reviews.
- Barangay Admins process attraction bookings, assign guides, and review
  resort listings and edits for their assigned area.
- Resort Owners manage only their own approved listing and requests after
  Municipal account approval. Public listing edits await Barangay review;
  the last approved version remains public in the meantime.
- Resort services include day visits/entrance, facilities, overnight stays,
  and activities. Availability is manual; payments and inventory are out of
  scope.
- Tourists request one published service. The server derives the destination,
  service, and fee from approved data. Owners accept or decline their own
  requests.
- No browser code receives the service-role key. Database policies and
  server-side checks remain authoritative.

## Implementation status

- [x] Add role, barangay, resort, service, listing-review, and booking-scope
  schema and RLS in `backend/database/local-roles-resorts.sql`.
- [x] Add municipal-approved owner signup and staff provisioning in
  `supabase/functions/local-accounts/` and shared handler tests.
- [x] Validate and route attraction and service-based resort requests through
  `supabase/functions/secure-api/`; cover input and routing rules with tests.
- [x] Add shared role/state support, Barangay Admin and Resort Owner portals,
  and Municipal account/listing review controls.
- [x] Add tourist resort discovery and category filtering.
- [x] Update this spec, deployment instructions, and migration ordering.

Focused Node tests for local accounts, secure bookings, shared state, and
attraction filtering passed during implementation.

## Remaining before launch

- [x] Apply `local-roles-resorts.sql` to the linked Supabase project twice;
  verify the privacy grants and pass `supabase db lint --linked`.
- [x] Deploy `secure-api` and `local-accounts` with JWT verification disabled
  as configured; smoke-test the public handlers without creating rows.
- [x] Run `node scripts/build-netlify.mjs` and the source-only Node test suite
  (32 tests passed); verify that both portal pages and public links are in the
  Netlify output.
- [ ] Test all four roles against a configured Supabase project and verify
  cross-barangay and cross-owner access is denied. A Municipal Admin account
  and one barangay are present, but complete owner/admin workflows still need
  account credentials and interactive testing.
- [ ] Configure production Supabase Auth URLs, publish the Netlify site, and
  verify the hosted workflows. Netlify deployment has not been performed.
