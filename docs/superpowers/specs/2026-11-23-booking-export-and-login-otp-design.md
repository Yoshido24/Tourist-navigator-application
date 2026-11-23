# Monthly Booking Export and Login Email OTP

## Intent

Managers need durable copies of booking history, and staff accounts need a
fresh email verification step each time they sign in. The implementation will
build on the existing Supabase authentication and role-scoped booking access.

## Goals

- Let municipal admins, barangay admins, and resort owners export booking
  history for one calendar month.
- Support both an Excel-compatible CSV file and a printable PDF workflow.
- Require barangay admins, guides, and resort owners to verify a fresh
  six-digit email code whenever they sign in.
- Deliver verification codes through a configured Gmail SMTP account without
  storing SMTP credentials in source control.
- Preserve existing row-level security so users can export only records they
  are already authorized to read.

## Non-goals

- No new password-management flow.
- No email verification requirement for the municipal admin in this change.
- No export of guide-only personal dashboards unless a later requirement adds
  that explicitly.
- No promise of unlimited email delivery. Gmail and Supabase/provider abuse
  limits still apply; the application will remove the repository's current
  two-emails-per-hour bottleneck and set a practical allowance.
- No payment, invoice, or accounting report.

## User experience

### Booking export

- The existing booking area for municipal, barangay, and resort management gets
  an "Export booking history" control.
- The control contains a `type="month"` field and two actions: "Download Excel"
  and "Print PDF".
- The initial value is the previous calendar month.
- Users can choose any calendar month, including older months.
- The export includes only records visible to the current authenticated user.
- CSV downloads use a filename such as
  `booking-history-2026-10.csv`.
- "Print PDF" opens a clean printable table; the user uses the browser's
  Save as PDF option.
- Empty months show a clear message and do not create a misleading file.

### Login verification

- The affected login forms ask for an email first.
- Email OTP **replaces password entry for staff sign-in**; it is the only
  sign-in factor for those affected portals, not a custom second factor added
  after a password session has already been created.
- "Send verification code" requests a Supabase email OTP with account creation
  disabled, preventing unknown emails from registering through the login form.
- The form then asks for the six-digit code.
- A verified code creates the normal Supabase session only after OTP
  verification succeeds.
- Barangay, guide approval, and resort-owner role checks continue immediately
  after verification. An unauthorized or pending account is signed out and
  receives the same clear message as today.
- If the provider rejects sending, expires a code, or receives an invalid
  code, the user sees a specific actionable message and the session is not
  opened.
- An explicit sign-out is still the boundary for "a new login"; ordinary page
  reloads continue an existing authenticated session.

## Data and security

- A security-invoker database function selects export rows by a single month.
  Existing `bookings` row-level-security policies determine which rows are
  visible.
- The effective booking month uses a valid `date` value when present and
  otherwise falls back to `created_at` converted to the
  `Asia/Manila` timezone before taking the date.
- The previous-month default is also calculated in the `Asia/Manila`
  timezone.
- The export fields are:
  - booking ID
  - status
  - scheduled date and time
  - destination/attraction or service
  - target type
  - traveler name and contact
  - adults, children, and PWD count
  - assigned guide
  - check-in/check-out
  - service fee
  - notes
  - created, approved, and completed timestamps
- CSV values are escaped correctly and cells beginning with `=`, `+`, `-`, or
  `@` are neutralized to avoid spreadsheet formula injection.
- Printable HTML escapes every database value.
- Authentication uses Supabase Auth's native OTP verification rather than a
  custom frontend-only challenge; no unverified session grants dashboard
  access.

## Email delivery

- The local configuration uses Supabase's SMTP settings with
  `smtp.gmail.com:587`.
- Gmail credentials are supplied through environment variables
  (`SUPABASE_AUTH_SMTP_USER` and `SUPABASE_AUTH_SMTP_PASS`), never committed.
- The email subject and body use Supabase's OTP template and include the
  six-digit code plus an expiry notice.
- `email_sent` is raised from 2/hour to 500/hour for local/self-hosted use and
  `max_frequency` remains bounded to resist rapid resend abuse.
- Hosted Supabase deployments must configure the same custom SMTP values in
  the Auth SMTP dashboard because `config.toml` alone does not change a hosted
  project.
- The setup documentation explains Gmail app-password prerequisites and the
  unavoidable Gmail daily sending ceiling.

## Architecture

- Add one shared browser helper for:
  - previous-month selection
  - loading monthly rows from the RPC
  - CSV generation/download
  - printable table generation
  - formula-injection-safe serialization
- Add one shared browser helper for Supabase email OTP so the three affected
  login pages use the same behavior and error mapping.
- Add focused controls and styles to existing management/login HTML and wire
  them into the existing page scripts.
- Add a SQL migration and security tests for month filtering and role-scoped
  export behavior.
- Add JavaScript unit tests for month boundaries, CSV escaping/formula
  neutralization, and printable-value escaping. Existing Node test patterns
  should be reused.

## Files expected to change

- `backend/database/booking-exports.sql`
- `backend/database/booking-exports.test.sql`
- shared frontend export and OTP helpers
- municipal, barangay, and resort booking UI files
- guide, barangay, and resort login UI files
- `supabase/config.toml`
- setup/auth documentation
- focused test files for the shared helpers

## Acceptance criteria

1. A municipal admin can select a past month, download all visible bookings as
   CSV, and print the same rows to PDF.
2. Barangay admins and resort owners can export only their RLS-permitted
   records for the selected month.
3. A booking on the first and last day of the selected month appears exactly
   once; adjacent-month records do not appear.
4. Records without a valid scheduled date are grouped by creation date.
5. Spreadsheet formulas from database text cannot execute in CSV exports.
6. Unknown accounts cannot create a new account from the OTP login flow.
7. Barangay admins, approved guides, and approved resort owners cannot open a
   session before entering a valid six-digit OTP.
8. Invalid, expired, and delivery-failure states leave the user on the login
   form with an actionable message.
9. Existing password reset behavior is retained for account recovery unless it
   is incompatible with the selected OTP-only sign-in flow. A password is no
   longer requested by the three affected login forms.
10. No Gmail password or app password is committed.

## Builder calls

- Build Excel support as UTF-8 CSV rather than adding a binary XLSX dependency.
- Build PDF support through a dedicated print stylesheet/window rather than a
  PDF-generation dependency.
- Keep the two shared helpers dependency-free so the existing static frontend
  remains lightweight.
- Keep resend intervals bounded even though the hourly email ceiling is raised;
  this is an anti-abuse control, not a per-user product limit.
