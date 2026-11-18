# Tourist Navigator Application

A multi-platform navigator for local tourist attractions in Montalban.

## Project structure

```text
apps/
  web/       Public, responsive tourist experience
  mobile/    Guide experience, designed mobile-first
  desktop/   Admin dashboard
frontend/
  shared/    Shared styles, browser logic, and public Supabase settings
    css/      Shared stylesheet
    js/       Shared application runtime
    config/   Public client configuration
  web/       Tourist portal assets and feature folders
  mobile/    Guide portal assets and feature folders
  desktop/   Admin portal assets and feature folders
backend/
  database/  Supabase SQL migrations
```

Portal-specific CSS and JavaScript live under `frontend/web`, `frontend/mobile`,
and `frontend/desktop`. Each portal loads the shared state module and its own
portal bundle:

- `frontend/web/js/portal.js` contains the tourist map, attractions, booking,
  directions, and Mini Shop experience.
- `frontend/desktop/js/portal.js` contains attraction, transport, booking,
  guide, and admin shop management.
- `frontend/mobile/js/portal.js` contains guide schedules, assigned bookings,
  and visitor lists.

The shared [state.js](frontend/shared/js/state.js) contains only shared storage,
state updates, and reusable data helpers. The shared CSS entry point is
[styles.css](frontend/shared/css/styles.css), which contains the foundation
and layout primitives. Portal component styles live in each portal's
`css/portal-components.css`.

## Open an app

- [Web user app](apps/web/user.html)
- [Admin portal access](apps/desktop/admin-access.html)
- [Guide and resort owner access](apps/mobile/partner-access.html)
- [Mobile guide app](apps/mobile/guide.html)
- [Desktop admin app](apps/desktop/admin.html)
- [Barangay Admin portal](apps/desktop/barangay-admin.html)
- [Resort Owner portal](apps/desktop/resort-manager.html)

Open [index.html](index.html) to enter the project from the public web app. It is responsive at phone, tablet, and desktop widths. The root `index.html`, `user.html`, `guide.html`, and `admin.html` remain as redirects so existing bookmarks still work.

## Deploy to Netlify

1. Push this repository to GitHub and import it into Netlify as a new site.
2. Leave the base directory blank. Netlify reads [netlify.toml](netlify.toml),
   builds the static site, and publishes `dist/netlify`.
3. Before launch, configure the Supabase URL and publishable key in
   `frontend/shared/config/supabase.public.js`, and deploy the Edge Function
   using the Supabase instructions below.
4. Open the Netlify site URL over HTTPS. The app pages and Leaflet tiles load
   from that hosted origin; the OpenStreetMap public tile service remains
   subject to its usage policy and availability.

The Netlify build copies only the app pages, app assets, shared frontend, and
security headers into its publish directory. It does not publish the Android
project, backend SQL, or Supabase function source.

## Supabase backend setup

1. Create a project at [Supabase](https://supabase.com).
2. Add the project URL and publishable/anon key to
   `frontend/shared/config/supabase.public.js`. Never put the service-role key
   in frontend code.
3. Run the SQL files in the order listed in [backend/README.md](backend/README.md)
   in the Supabase SQL Editor. These migrations create the portal tables, role
   scopes, and Row Level Security policies.
4. Assign the Municipal Super Admin role to one trusted account with a
   privileged server-side operation. For example, after creating the account,
   replace the email and run this in the Supabase SQL Editor:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
       || '{"role":"municipal_super_admin"}'::jsonb
   where email = 'admin@example.com';
   ```

   Do not allow users to edit their own app metadata.
5. Link the Supabase CLI to the project and deploy both Edge Functions:

   ```powershell
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase secrets set "RECAPTCHA_ENABLED=false"
   supabase functions deploy secure-api
   supabase functions deploy local-accounts
   ```

   `local-accounts` supports public owner signup, so its function JWT setting
   must remain disabled as configured; privileged staff actions verify the
   caller's authenticated role inside the function. `secure-api` is public and
   validates booking fields and terms. CAPTCHA is disabled by default, which
   leaves booking more exposed to automated spam. To enable it, set
   `RECAPTCHA_ENABLED=true` in the frontend config and Supabase secrets, set
   `RECAPTCHA_SECRET_KEY` only in Supabase secrets, and redeploy `secure-api`.
   Include the hosted domain in the CAPTCHA provider's allowed domains.

6. Configure Supabase Auth's site URL and redirect URLs for the Netlify site.
   Test the four portal roles: Municipal Super Admin, Barangay Admin, Resort
   Owner, and Tourist.

Resort owners self-register, but cannot access owner tools until approved by a
Municipal Super Admin. Barangay Admins review resort listings and edits for
their assigned area. Resort requests are manually accepted or declined by the
owner; payments and live availability are not included.

When no Supabase connection is configured, the app falls back to IndexedDB in the browser. New installations start empty; admins can add attractions, guides, bookings, and shop products from the portals.
