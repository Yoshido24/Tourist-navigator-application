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
