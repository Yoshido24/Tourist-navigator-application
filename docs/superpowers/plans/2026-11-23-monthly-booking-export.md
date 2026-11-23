# Monthly Booking Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add role-scoped, month-filtered booking exports as Excel-compatible CSV and print-to-PDF from all management booking views.

**Architecture:** A security-invoker Postgres function filters bookings for one `Asia/Manila` calendar month while leaving row visibility to existing RLS. A dependency-free shared browser helper loads that function, serializes safe CSV, and renders an escaped printable report; each existing portal mounts the same controls.

**Tech Stack:** PostgreSQL/PLpgSQL, Supabase PostgREST RPC, static browser JavaScript, CSS, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-23-booking-export-and-login-otp-design.md`

## Global Constraints

- Export only records already visible under the authenticated user's existing RLS policies.
- Use the scheduled `date` when valid, otherwise the `created_at` date in `Asia/Manila`.
- Use Excel-compatible UTF-8 CSV rather than an XLSX dependency.
- Use a dedicated printable window rather than a PDF dependency.
- Neutralize spreadsheet cells beginning with `=`, `+`, `-`, or `@`.
- Escape every database value before putting it into printable HTML.
- Default to the previous calendar month in `Asia/Manila`.

## Review Focus

- Month boundary records are included exactly once; pin this in the SQL test with the first and last day plus adjacent-month rows.
- A malformed or empty scheduled date falls back safely to `created_at`; pin this in the SQL test.
- CSV formula payloads cannot execute; pin this in the helper test for all four dangerous prefixes.
- A popup blocked by the browser yields a visible error instead of silently doing nothing; pin this in an integration test with `window.open` returning `null`.
- Data visible to one role cannot cross RLS boundaries through the export RPC; pin this in the SQL test for municipal, barangay, and resort sessions.

---

### Task 1: Add the secure monthly export query

**Files:**
- Create: `backend/database/booking-exports.sql`
- Create: `backend/database/booking-exports.test.sql`
- Modify: `backend/README.md`

**Interfaces:**
- Produces: `public.export_bookings_for_month(p_month date)` returning the fixed export columns described in the spec.
- Produces: one row per booking visible to the caller whose effective Manila date is inside the selected calendar month.
- Consumes: existing `public.bookings` columns and RLS policies from the role migrations.

- [ ] **Step 1: Add the rollback-only SQL test**

Create fixtures for a municipal user, a barangay admin, two barangays, a resort owner, and bookings dated on the selected month's first/last days, both adjacent months, one blank date, and one malformed date. Assert that the municipal call sees all permitted rows, the barangay call sees only assigned-attraction rows, and the resort call sees only its own resort rows.

- [ ] **Step 2: Run the test to verify the missing RPC fails**

Run: `psql <database-url> -v ON_ERROR_STOP=1 -f backend/database/booking-exports.test.sql`

Expected: FAIL because `public.export_bookings_for_month(date)` does not exist.

- [ ] **Step 3: Implement `export_bookings_for_month(p_month date)`**

Create a `returns table` SQL function with `security invoker` and `set search_path = public`. Validate that `p_month` is not null, normalize it to month start, and calculate the effective booking date from valid `YYYY-MM-DD` text or `created_at at time zone 'Asia/Manila'`; grant execution only to `authenticated`.

- [ ] **Step 4: Run the migration and SQL test**

Run the migration followed by:
`psql <database-url> -v ON_ERROR_STOP=1 -f backend/database/booking-exports.test.sql`

Expected: PASS and final `ROLLBACK`.

- [ ] **Step 5: Document migration order**

Add `database/booking-exports.sql` after the role and guide migrations and document the rollback-only test command.

- [ ] **Step 6: Commit**

Run:
`git add backend/database/booking-exports.sql backend/database/booking-exports.test.sql backend/README.md`
`git commit -m "feat: add scoped monthly booking export query"`

### Task 2: Build and test the shared export helper

**Files:**
- Create: `frontend/shared/js/booking-export.js`
- Create: `frontend/shared/js/booking-export.test.mjs`

**Interfaces:**
- Produces: global `window.BookingHistoryExport.setup(options)`.
- Produces: pure global helpers `previousManilaMonth(referenceDate)`, `bookingHistoryCsv(rows)`, and `bookingHistoryPrintHtml(rows, month)`.
- Consumes: `supabaseClient.rpc('export_bookings_for_month', { p_month })`.

- [ ] **Step 1: Write failing helper tests**

Test `previousManilaMonth(new Date('2026-11-01T01:00:00Z'))` returns `"2026-10"`, CSV quotes commas/quotes/newlines, CSV prefixes all of `= + - @` with an apostrophe, CSV starts with a UTF-8 BOM, print HTML contains all field labels but no unescaped `<script>`, and a blocked popup throws an actionable error.

- [ ] **Step 2: Run the helper tests to verify failure**

Run: `node --test frontend/shared/js/booking-export.test.mjs`

Expected: FAIL because `booking-export.js` does not exist.

- [ ] **Step 3: Implement the pure helpers and setup API**

Implement `BookingHistoryExport.setup({ containerId })`. The month control loads rows through the RPC, offers CSV download and print, disables actions while loading, shows empty/error states, and writes a filename of `booking-history-YYYY-MM.csv`.

- [ ] **Step 4: Run the helper tests to verify pass**

Run: `node --test frontend/shared/js/booking-export.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
`git add frontend/shared/js/booking-export.js frontend/shared/js/booking-export.test.mjs`
`git commit -m "feat: add safe booking export helper"`

### Task 3: Mount export controls in management portals

**Files:**
- Modify: `apps/desktop/admin.html`
- Modify: `apps/desktop/barangay-admin.html`
- Modify: `apps/desktop/resort-manager.html`
- Modify: `frontend/desktop/js/portal.js`
- Modify: `frontend/desktop/js/barangay-admin.js`
- Modify: `frontend/desktop/js/resort-manager.js`
- Modify: `frontend/desktop/css/portal-components.css`
- Test: `frontend/desktop/features/bookings/bookings.test.mjs`
- Test: `frontend/desktop/js/barangay-admin.test.mjs`
- Test: `frontend/desktop/js/resort-manager.test.mjs`

**Interfaces:**
- Consumes: `window.BookingHistoryExport.setup({ containerId })` from Task 2.
- Produces: export controls in the municipal booking-history panel and the barangay/resort bookings panels.

- [ ] **Step 1: Add failing portal integration assertions**

Assert each HTML page loads `booking-export.js` and contains its unique export container, and update VM tests to assert the helper is invoked only after a valid role/session exposes the dashboard.

- [ ] **Step 2: Run focused portal tests to verify failure**

Run: `node --test frontend/desktop/features/bookings/bookings.test.mjs frontend/desktop/js/barangay-admin.test.mjs frontend/desktop/js/resort-manager.test.mjs`

Expected: FAIL on missing export containers or setup calls.

- [ ] **Step 3: Add the controls and portal wiring**

Add the month, download, print, and message elements to each booking view, load the shared script before portal logic, and call setup after role/session checks. Keep the same helper in all three views so formatting and security rules cannot drift.

- [ ] **Step 4: Add export control styles**

Style the control group responsively and add print-only report styles used by generated report markup.

- [ ] **Step 5: Run focused portal tests**

Run: `node --test frontend/desktop/features/bookings/bookings.test.mjs frontend/desktop/js/barangay-admin.test.mjs frontend/desktop/js/resort-manager.test.mjs`

Expected: PASS.

- [ ] **Step 6: Build the published site and inspect it**

Run: `node scripts/build-netlify.mjs`

Expected: completes and copies the new shared helper into `dist/netlify/frontend/shared/js/booking-export.js`; inspect the three published booking views for their controls.

- [ ] **Step 7: Commit**

Run:
`git add apps/desktop frontend/desktop frontend/shared/js/booking-export.js scripts/build-netlify.test.mjs`
`git commit -m "feat: add booking history exports to management"`

