# Passwordless Login OTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require six-digit Supabase email OTP verification for barangay-admin, guide, and resort-owner logins, delivered through configured Gmail SMTP.

**Architecture:** A shared browser login helper owns the two-step email/token state machine and maps Supabase errors; the three existing portal scripts supply their role/approval callback. Supabase Auth remains the security boundary, so a session is created only after `verifyOtp` succeeds.

**Tech Stack:** Supabase Auth email OTP, static browser JavaScript, Supabase SMTP/Gmail, HTML/CSS, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-23-booking-export-and-login-otp-design.md`

## Global Constraints

- Email OTP replaces password entry; do not create a password-authenticated session before verification.
- Request OTP with `shouldCreateUser: false`.
- Use a six-digit numeric one-time code.
- Never store Gmail or Supabase secrets in source.
- Preserve portal-specific auth storage and existing role/approval checks.
- Do not remove bounded resend/abuse controls; Gmail still has a provider limit.

## Review Focus

- Unknown email addresses must not become accounts; pin `shouldCreateUser: false` in the helper test.
- An invalid code must not invoke the role callback or expose a dashboard; pin this in helper and portal tests.
- Role rejection must sign out a just-created session; pin this in all affected portal tests.
- Expired/rate-limited delivery errors must be actionable and not reset the email unexpectedly; pin this in helper tests.
- Existing authenticated-session restoration must remain usable without prompting on reload; pin this in guide, barangay, and resort portal tests.

---

### Task 1: Build the shared email OTP login state machine

**Files:**
- Create: `frontend/shared/js/email-otp-login.js`
- Create: `frontend/shared/js/email-otp-login.test.mjs`

**Interfaces:**
- Produces: global `window.EmailOtpLogin.setup(options)`.
- Consumes: `options.form`, `emailInput`, `codeGroup`, `codeInput`, `submitButton`, `message`, `resetButton`, `client`, and async `onVerified(session)`.
- Produces: first submit sends OTP; second submit verifies it; reset returns to email entry.

- [ ] **Step 1: Write failing OTP state-machine tests**

Use a fake Supabase client. Assert a first submit calls `signInWithOtp({ email, options: { shouldCreateUser: false } })`, reveals the code field, and does not call `onVerified`; a matching six-digit second submit calls `verifyOtp({ email, token, type: 'email' })` and supplies the session; invalid delivery/verification errors stay on the form; reset clears the challenge; and unsupported non-six-digit input is rejected before network access.

- [ ] **Step 2: Run the helper test to verify failure**

Run: `node --test frontend/shared/js/email-otp-login.test.mjs`

Expected: FAIL because `email-otp-login.js` does not exist.

- [ ] **Step 3: Implement the helper**

Implement `window.EmailOtpLogin.setup` with explicit `email` and `code` phases, disabled controls while requests are in flight, no broad catch that hides errors, and actionable maps for rate limits, invalid/expired tokens, unknown email, and provider failure.

- [ ] **Step 4: Run the helper tests**

Run: `node --test frontend/shared/js/email-otp-login.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
`git add frontend/shared/js/email-otp-login.js frontend/shared/js/email-otp-login.test.mjs`
`git commit -m "feat: add shared email otp login flow"`

### Task 2: Convert barangay, guide, and resort login forms

**Files:**
- Modify: `apps/desktop/barangay-admin.html`
- Modify: `apps/desktop/resort-manager.html`
- Modify: `apps/mobile/guide-login.html`
- Modify: `frontend/desktop/js/barangay-admin.js`
- Modify: `frontend/desktop/js/resort-manager.js`
- Modify: `frontend/mobile/js/guide-login.js`
- Modify: `frontend/desktop/css/portal-components.css`
- Modify: `frontend/mobile/css/portal-components.css`
- Test: `frontend/desktop/js/barangay-admin.test.mjs`
- Test: `frontend/desktop/js/resort-manager.test.mjs`
- Create: `frontend/mobile/js/guide-login.test.mjs`

**Interfaces:**
- Consumes: `window.EmailOtpLogin.setup(options)` from Task 1.
- Consumes: existing role checks after `onVerified(session)` for each portal.
- Produces: no password field in affected login forms and no `signInWithPassword` call for those portals.

- [ ] **Step 1: Add failing login integration tests**

Assert each affected HTML form contains one email field, one hidden OTP group with a six-digit input, and loads the shared helper. In VM tests, invoke the captured submit/helper callbacks and assert Barangay Admin role, approved guide, and approved resort manager checks occur after verification; rejection signs out and never opens the dashboard.

- [ ] **Step 2: Run focused login tests to verify failure**

Run: `node --test frontend/desktop/js/barangay-admin.test.mjs frontend/desktop/js/resort-manager.test.mjs frontend/mobile/js/guide-login.test.mjs`

Expected: FAIL because the old password forms and calls remain.

- [ ] **Step 3: Replace password inputs with code entry**

Add hidden six-digit code controls and a "Use a different email" reset button. Keep existing email and message IDs where possible to avoid unrelated CSS/JS changes.

- [ ] **Step 4: Wire role-specific callbacks through the shared helper**

Replace each `signInWithPassword` login handler with `EmailOtpLogin.setup`. Barangay login verifies `app_metadata.role`; guide login verifies an approved `guides` row; resort login verifies and loads its manager state. Every rejected post-verification account is signed out.

- [ ] **Step 5: Retain existing session restoration and password recovery**

Do not require a fresh OTP on page reload for an already-authenticated session. Preserve guide recovery reset via `resetPasswordForEmail` as account-recovery behavior even though password is not used for the new login form.

- [ ] **Step 6: Run focused login tests**

Run: `node --test frontend/desktop/js/barangay-admin.test.mjs frontend/desktop/js/resort-manager.test.mjs frontend/mobile/js/guide-login.test.mjs frontend/shared/js/state.test.mjs`

Expected: PASS and portal-specific storage behavior remains intact.

- [ ] **Step 7: Commit**

Run:
`git add apps/desktop apps/mobile frontend/desktop frontend/mobile frontend/shared/js/email-otp-login.js frontend/shared/js/state.test.mjs`
`git commit -m "feat: require email codes for staff logins"`

### Task 3: Configure and document Gmail OTP delivery

**Files:**
- Modify: `supabase/config.toml`
- Create: `supabase/templates/magic-link.html`
- Modify: `README.md`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes: `SUPABASE_AUTH_SMTP_USER` and `SUPABASE_AUTH_SMTP_PASS` environment variables.
- Produces: local/self-hosted Gmail SMTP OTP configuration with a six-digit-code email.
- Consumes: hosted dashboard configuration for deployed Supabase projects.

- [ ] **Step 1: Add configuration assertions to the existing build test**

Extend `scripts/build-netlify.test.mjs` to inspect the OTP login entry points and ensure no Gmail SMTP secret is copied into the published site.

- [ ] **Step 2: Run the build test to verify failure**

Run: `node --test scripts/build-netlify.test.mjs`

Expected: FAIL on the missing OTP helper references.

- [ ] **Step 3: Configure Supabase OTP and Gmail SMTP**

Uncomment and set Supabase SMTP to `smtp.gmail.com` port `587`, source sender/password from the two named environment variables, set `email_sent = 500`, keep `max_frequency = "30s"`, set `otp_expiry = 600`, and set the magic-link template to the new HTML containing `{{ .Token }}`.

- [ ] **Step 4: Add the OTP email template**

Create a simple responsive email containing the six-digit `{{ .Token }}`, a ten-minute expiry statement, and a warning to ignore the code if the login was not requested.

- [ ] **Step 5: Document local and hosted setup**

Document Gmail 2-Step Verification, app-password generation, secret environment variables, local CLI restart, hosted Auth SMTP settings, redirect URLs, and the unavoidable Gmail/provider daily limit. Explicitly state that no app password belongs in the repository.

- [ ] **Step 6: Run configuration and full static tests**

Run:
`node --test scripts/build-netlify.test.mjs`
`node --test frontend/shared/js/email-otp-login.test.mjs frontend/mobile/js/guide-login.test.mjs frontend/desktop/js/barangay-admin.test.mjs frontend/desktop/js/resort-manager.test.mjs frontend/shared/js/state.test.mjs`
`node scripts/build-netlify.mjs`

Expected: all tests PASS, and the build contains the OTP helper but no `.env` or SMTP secret value.

- [ ] **Step 7: Commit**

Run:
`git add supabase/config.toml supabase/templates/magic-link.html README.md backend/README.md scripts/build-netlify.test.mjs`
`git commit -m "chore: configure gmail delivery for login codes"`
