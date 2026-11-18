# Resort Registration and Map Listings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve resort signup errors and let approved owners submit accurately located, barangay-reviewed listings with coordinates safe for public map use.

**Architecture:** Keep public signup in the `local-accounts` Edge Function and municipal approval in the existing SQL review function. Add nullable coordinates to the resort listing workflow through an additive SQL script, require valid coordinates for new owner submissions, and publish coordinates only through `public_resorts`.

**Tech Stack:** JavaScript, Supabase Edge Functions, PostgreSQL, Leaflet, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-18-resort-barangay-map-workflows-design.md`

## Global Constraints

- Continue using the existing Supabase auth, RLS, approval functions, and page/component patterns; do not add dependencies.
- Keep the existing visual palette, typography, and shared UI styling; add navigation and controls using current components rather than redesigning the portals.
- Public resort reads continue through the `public_resorts` security-invoker view, exposing only approved public listing fields.
- Store coordinates with the same latitude/longitude semantics used for attraction pins. Do not geocode addresses or substitute a barangay center.
- No push/email notifications, new staff roles, changes to booking lifecycle, or changes to payment/availability handling.
- No automatic changes to existing attraction categories or resort listings.

## Review Focus

- Known duplicate signup versus unrelated auth failure: tests distinguish duplicate-safe copy and a distinct safe service error.
- Missing, malformed, or out-of-range submitted coordinates: SQL test rejects new owner submissions without a valid pin.
- Approved resort snapshot coordinates: SQL test verifies barangay approval copies the exact submitted coordinates.
- Legacy approved resorts with null coordinates: SQL test verifies they remain readable through `public_resorts`.
- Pending or rejected coordinates: SQL test verifies only approved resort rows are exposed through `public_resorts`.

---

### Task 1: Distinguish Resort Signup Failures

**Files:**
- Modify: `supabase/functions/_shared/local-accounts.mjs`
- Test: `supabase/functions/_shared/local-accounts.test.mjs`

**Interfaces:**
- Consumes: Supabase Auth signup response from `POST /auth/v1/signup`.
- Produces: Existing duplicate-safe message for known duplicate-account responses; a separate safe temporary-service message for all other rejected signup responses.

- [ ] **Step 1: Write the failing tests**

Add a test for a non-duplicate Auth rejection that expects a non-duplicate safe service message and no application write. Keep the existing empty-identities test asserting that duplicate signups create no application and do not delete the existing user.

- [ ] **Step 2: Run the tests and verify the new case fails**

Run: `node --test supabase/functions/_shared/local-accounts.test.mjs`
Expected: The new non-duplicate rejection test fails because the handler currently labels it as a possible duplicate email.

- [ ] **Step 3: Map Auth errors to safe user-facing messages**

Inspect only structured Auth error fields needed to identify known duplicate-account responses. Preserve the existing generic duplicate-safe message for those responses and empty identities; map other Auth failures to a distinct temporary-service message. Do not return or log raw provider response bodies.

- [ ] **Step 4: Run the tests and verify the behavior**

Run: `node --test supabase/functions/_shared/local-accounts.test.mjs`
Expected: PASS, including no application write on either failure path.

### Task 2: Persist and Review Resort Coordinates

**Files:**
- Create: `backend/database/resort-map-coordinates.sql`
- Modify: `backend/database/resort-owner-listing-flow.test.sql`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: `resort_submissions` and `resorts` from existing resort migrations; coordinates are a JSON array `[latitude, longitude]`.
- Produces: Nullable `coords` on legacy/public resort rows, validated non-null coordinates for new owner submissions, and coordinates copied to `public_resorts` only after barangay approval.

- [ ] **Step 1: Add failing SQL assertions**

Extend the rollback-only resort test with a valid coordinate submission, approval, and assertion that the public resort snapshot has the exact pair. Assert owner writes without coordinates or with out-of-range coordinates are denied and a legacy resort with null coordinates remains readable.

- [ ] **Step 2: Run the SQL test against a disposable Supabase test project**

Run: Apply the existing resort migrations and updated test script in a disposable project.
Expected: FAIL because the coordinate columns and validation are not present. Never run this fixture against production.

- [ ] **Step 3: Add the idempotent coordinate migration**

Add nullable `coords jsonb` columns to `resort_submissions` and `resorts`, validate coordinate shape/ranges, update owner insert/update RLS checks to require valid coordinates, and update `approve_resort_submission` to copy coordinates. Recreate `public_resorts` as a security-invoker view that includes `coords`, and grant only that additional public column.

- [ ] **Step 4: Document migration order and rerun the SQL test**

Add `resort-map-coordinates.sql` after `resort-owner-listing-flow.sql` in setup order. Reapply migrations and run the rollback-only test against the disposable project.
Expected: PASS; legacy null-coordinate rows remain available in the public view but new owner writes require a valid location.

### Task 3: Add Exact-Pin Selection to the Resort Owner Form

**Files:**
- Modify: `apps/desktop/resort-manager.html`
- Modify: `frontend/desktop/js/resort-manager.js`
- Test: `frontend/desktop/js/resort-manager.test.mjs`
- Add Leaflet CSS and script tags to `apps/desktop/resort-manager.html`; that page does not currently load Leaflet.

**Interfaces:**
- Consumes: Coordinate-aware `resort_submissions` schema from Task 2 and existing Leaflet dependency.
- Produces: Listing form submitting `coords: [latitude, longitude]` and preserving saved coordinates when editing.

- [ ] **Step 1: Write the failing owner-form test**

Extend the approved-owner listing test to select a map point and assert the exact latitude/longitude pair in the submitted payload. Add a case where an existing listing's saved pin is populated into the edit flow.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test frontend/desktop/js/resort-manager.test.mjs`
Expected: FAIL because listing submissions currently omit coordinates.

- [ ] **Step 3: Add the map pin control**

Add a pin-picker dialog using existing Leaflet assets and portal styles. Require a valid selected point before submission, include it in `resort_submissions`, and repopulate the saved point when editing. Do not change service or review workflows.

- [ ] **Step 4: Run the owner tests**

Run: `node --test frontend/desktop/js/resort-manager.test.mjs`
Expected: PASS, including service validation, exact coordinate submission, and existing-listing coordinate preservation.
