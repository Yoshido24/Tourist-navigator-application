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

Each portal keeps its own browser login, so signing into another role does not
replace it. Existing users must sign in once after this change. Separate browser
profiles are still needed to use multiple accounts in the same portal.

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

## Prepare the Android partner app

The Android project opens the partner portal for guides and resort owners. It
uses the application ID `com.montalban.navigator.guide`; check this ID in Play
Console before the first release, since it cannot be changed for an existing app.

1. Install Node.js, Android Studio, and the Android SDK, then run `npm install`.
2. After your latest changes, run `npm run android:sync` to copy the current
   website files into the Android project.
3. Run `npm run mobile:android` to open the project in Android Studio. Test both
   roles on an Android device, including sign-in, signup, and account recovery.
4. Replace the template launcher icon and splash screen with your app branding.
   In Android Studio, use **Build > Generate Signed Bundle / APK** to create a
   signed Android App Bundle. Keep the upload keystore and passwords private and
   backed up; do not commit them to the repository.
5. Upload the signed `.aab` to Google Play Console, complete its store listing
   and required declarations, and submit it for review.

The native project is in `android-partners`; the separate `android` directory
is not used by these commands. The current guide confirmation and password
recovery links use the app's local web origin and are not usable from an email
app. Configure and test a hosted redirect or Android deep link before release,
including Supabase Auth's allowed redirect URLs. The app needs internet access
for its backend and externally hosted libraries.

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

### Brevo codes for staff login

Barangay Admin, Guide, and Resort Owner login uses a fresh six-digit Supabase
email OTP. Passwords remain part of account creation and recovery, but the
three staff login forms do not create a password-authenticated session.

For local or self-hosted Supabase, create a Brevo account, add and verify the
sending domain, create a sender email, and generate an SMTP key in
**SMTP & API > SMTP**. Do not use a Brevo API key as the SMTP password. Set
the Brevo login, SMTP key, and verified sender in the environment that starts
Supabase:

```powershell
$env:SUPABASE_AUTH_SMTP_USER = "<brevo-account-login-email>"
$env:SUPABASE_AUTH_SMTP_PASS = "<brevo-smtp-key>"
$env:SUPABASE_AUTH_SMTP_SENDER_EMAIL = "no-reply@your-verified-domain.example"
supabase stop
supabase start
```

For the hosted Supabase project, open **Authentication > SMTP Settings** and
set:

- Host: `smtp-relay.brevo.com`
- Port: `587`
- Username: Brevo account login email
- Password: Brevo SMTP key
- Sender email: the verified Brevo sender on your domain
- Sender name: `Montalban Navigator`
- Minimum interval per user: at least `30` seconds

Then open **Authentication > Email Templates > Magic Link** and paste the
subject and body from `supabase/templates/magic-link.html`, preserving
`{{ .Token }}` and removing `{{ .ConfirmationURL }}`. This is the step that
changes the received message from a login link into a six-digit code.
`config.toml` configures local/self-hosted Supabase only; it does not update
hosted dashboard settings automatically.

The repository raises the configurable hourly allowance to 500 while retaining
a 30-second resend guard. Supabase raises the hosted default only after custom
SMTP is enabled. Brevo has its own account and daily sending quota; no external
provider offers unlimited transactional email. Never expose the SMTP key in
frontend code, Netlify environment variables, SQL, or committed files.

Resort owners self-register, but cannot access owner tools until approved by a
Municipal Super Admin. Barangay Admins review resort listings and edits for
their assigned area. Resort requests are manually accepted or declined by the
owner; payments and live availability are not included.
The resort dashboard has Listing and Bookings tabs. Owners can add up to five
photos (JPEG, PNG or WebP, 5 MB each) and manage services; approved photos are
shown to tourists. See [backend setup](backend/README.md) for Storage setup.
Booking decisions do not automatically send SMS notifications.

Municipal Super Admins assign each guide to one barangay in the Guides section.
Existing guides are unassigned until updated; Barangay Admins can access and
assign approved guides only within their assigned barangays.

When no Supabase connection is configured, the app falls back to IndexedDB in the browser. New installations start empty; admins can add attractions, guides, bookings, and shop products from the portals.
