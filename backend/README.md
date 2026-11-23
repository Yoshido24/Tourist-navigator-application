# Backend

The project uses Supabase Auth, Postgres, Row Level Security, and Edge Functions.
The browser uses only the publishable key from
`frontend/shared/config/supabase.public.js`; never put a service-role key in
frontend code.

## Database setup

Run these scripts in the Supabase SQL Editor in order:

1. `database/supabase-attractions-map.sql`
2. `database/fix-rls-and-shop-products.sql`
3. `database/unify-ids-and-guides.sql`
4. `database/security-lockdown.sql`
5. `database/local-roles-resorts.sql`
6. `database/resort-owner-listing-flow.sql`
7. `database/role-workflows.sql`
8. `database/guide-barangay.sql`
9. `database/resort-photos.sql`
10. `database/event-announcements.sql`
11. `database/showcases.sql`
12. `database/attraction-photos.sql`
13. `database/resort-profile.sql`
14. `database/shop-product-photos.sql`
15. `database/booking-exports.sql`

`resort-profile.sql` adds resort facilities, hours, Facebook link, house rules,
map pin and owner-managed closed dates. Closed dates take effect immediately
(no review) and the `secure-api` function rejects bookings on them, so deploy
the SQL before the updated function and portals.

The resort migrations add barangay and resort roles, service offerings, owner
approval, booking routing, and the associated RLS policies. Review the SQL
against the target project's existing schema before applying it.
New owners add services in their dashboard after municipal account approval,
then submit the listing for barangay review. Existing applications that already
include services retain their original listing review flow.
Apply `resort-owner-listing-flow.sql` before deploying the updated
`local-accounts` function so new registrations do not enter the old flow.
Tourist clients read approved resort snapshots through `public_resorts`; do
not grant table-wide public access to `resorts`, which stores the private owner
ID.

Resort photos use the private `resort-photos` Storage bucket. Owners can upload
JPEG, PNG, or WebP files up to 5 MB each, with up to five photos per listing.
Assigned barangay reviewers can see pending photos; visitors can access only
photos referenced by approved resorts. Deploy the SQL before the updated
portals. Failed uploads or listing submissions and later listing edits can leave
unreferenced objects in Storage; review them before removing them through the
Supabase Storage API or dashboard. Do not delete referenced photos.
`database/resort-photos.test.sql` exercises the Storage policies in a disposable
Supabase project after the migrations.

Event announcements are managed by Municipal Super Admins and are public until
their end time. The migration creates the `event-banners` public Storage bucket;
all images uploaded there are publicly retrievable, and only Municipal Super
Admins can upload or remove JPEG, PNG, or WebP banners up to 5 MB. Use only
images intended for public display. If a cleanup error is shown, remove the
unreferenced banner through Supabase Storage after confirming it is no longer
used. Apply the migration before deploying the updated portals.
`database/event-announcements.test.sql` checks announcement visibility and
municipal-only record access in a disposable Supabase project.

Showcase places are stored separately from bookable attractions. Visitors can
read their names, descriptions, and map pins; only Municipal Super Admins can
add, edit, or delete them. They have no booking or guide workflow. Apply
`showcases.sql` before publishing the updated portals.
`database/showcases.test.sql` checks public reads and municipal-only changes in
a disposable Supabase project.

Shop product photos use a public Storage bucket so published products can show
their images. Photos are publicly retrievable by direct URL as soon as uploaded,
including while a Barangay product awaits review. Only Municipal and Barangay
Admins can upload or remove JPEG, PNG, or WebP images up to 5 MB. Apply
`database/shop-product-photos.sql` before publishing the updated portals, then
run `database/shop-product-photos.test.sql` in a disposable project. Photos from
rejected proposals or deleted products remain in Storage; remove unused images
manually after confirming no approved product references them.
If uploads fail, check that `shop-product-photos` exists in the same Supabase
project used by the live site and that this migration has been applied there.

## Staff email OTP

The Barangay Admin, Guide, and Resort Owner portals use Supabase email OTP.
`supabase/config.toml` is configured for Gmail SMTP through
`SUPABASE_AUTH_SMTP_USER` and `SUPABASE_AUTH_SMTP_PASS`; keep both values out of
source control. Codes expire after 10 minutes, and rapid resend attempts remain
rate limited. See the root README for local credentials and hosted-dashboard
setup. Provider quotas still apply even though the previous two-emails-per-hour
repository setting has been removed.

The role workflow migration keeps existing attractions and products intact.
Barangay admins submit new attractions and products for municipal approval and
edit their own published attractions. Attraction locations can be selected on
the map or entered as coordinates. Municipal admins can assign legacy
attractions to a barangay under Local admin; attractions without a barangay
remain visible but cannot receive new bookings. Attraction booking decisions
and guide assignments belong to barangay admins; municipal booking views are
read-only. When an attraction is assigned or moved to another barangay, its
existing bookings move with it. Unassigning an attraction stops new bookings
but leaves existing bookings with their last assigned barangay until it is
assigned again. Removing a guide returns assigned bookings for reassignment;
guides with confirmed or ongoing tours cannot be removed.
Apply the migration, deploy the updated `secure-api` function, and
publish the matching portal files together. Do not publish the updated portal
against a database that has not received the migration.

`database/role-workflows.test.sql` contains rollback-only fixtures for a
disposable test project. Run the migration and test in the same transaction
when previewing it; the test's final `rollback` undoes both.

`database/booking-exports.sql` adds a security-invoker function used by the
management portals to export one calendar month. The existing booking RLS
policies determine which rows each role receives. Run
`database/booking-exports.test.sql` after the migration in a disposable
project; it verifies Manila month boundaries and municipal, Barangay Admin,
and resort-owner scoping, then rolls back its fixtures.

Municipal admins assign one barangay to each guide in the Guides section.
Existing guides remain unassigned until updated and are not visible or
assignable to Barangay Admins until then. Barangay Admins can read approved
guides in their assigned areas and assign them only to bookings in the same
barangay. Run `database/guide-barangay.test.sql` in a disposable test project
after applying the migrations.

## Edge Functions

From the repository root, log in and link the Supabase CLI to the intended
project, then deploy:

```powershell
supabase functions deploy secure-api
supabase functions deploy local-accounts
```

Keep `local-accounts` configured with `verify_jwt = false`: public resort-owner
signup uses it without a session, while staff-only operations independently
verify the caller's authenticated role. Do not remove those in-function
authorization checks. The Edge Functions use Supabase's server-side
environment; service-role credentials must never be exposed to the browser.

Set `RECAPTCHA_ENABLED` consistently in the public frontend config and Supabase
secrets. If enabled, store `RECAPTCHA_SECRET_KEY` only in Supabase secrets.

For the full Netlify and Supabase launch checklist, see the root `README.md`.
