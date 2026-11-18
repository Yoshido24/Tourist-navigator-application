# Admin Navigation and Attraction Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Barangay Admins tabbed access to existing workflows and make Municipal Admin attraction editing straightforward without changing role permissions.

**Architecture:** Group the existing Barangay Admin sections behind accessible tab controls. Reuse the current attraction form and `updateState` save path for Municipal Admin edits, while providing one shared attraction category list to both admin forms and preserving existing category values.

**Tech Stack:** HTML, CSS, classic browser JavaScript, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-18-resort-barangay-map-workflows-design.md`

## Global Constraints

- Continue using the existing Supabase auth, RLS, approval functions, and page/component patterns; do not add dependencies.
- Keep the existing visual palette, typography, and shared UI styling; add navigation and controls using current components rather than redesigning the portals.
- Public resort reads continue through the `public_resorts` security-invoker view, exposing only approved public listing fields.
- Store coordinates with the same latitude/longitude semantics used for attraction pins. Do not geocode addresses or substitute a barangay center.
- No push/email notifications, new staff roles, changes to booking lifecycle, or changes to payment/availability handling.
- No automatic changes to existing attraction categories or resort listings.

## Review Focus

- Multi-area Barangay Admin retains scoped content: keep existing dashboard tests passing.
- Unassigned Barangay Admin sees no unrelated listings/bookings: preserve the no-assignment empty state.
- Tab navigation leaves one panel visible and updates `aria-selected`: add a focused tab test.
- Existing nonstandard category strings remain selectable when editing: add a legacy-category test.
- Attraction edits preserve existing coordinates unless explicitly changed: add an edit-save regression test.

---

### Task 1: Add Barangay Admin Tabs

**Files:**
- Modify: `apps/desktop/barangay-admin.html`
- Modify: `frontend/desktop/js/barangay-admin.js`
- Test: `frontend/desktop/js/barangay-admin.test.mjs`

**Interfaces:**
- Consumes: Existing dashboard sections and DOMContentLoaded startup.
- Produces: Tabs `Attractions and shop products`, `Existing attractions`, `Attraction bookings`, and `Resort listings to review`; area scoping remains unchanged.

- [x] **Step 1: Write the failing tab-switch test**

Assert that each tab shows only its panel and synchronizes its own `aria-selected="true"` with the other tabs' `false` values.

- [x] **Step 2: Run the test and verify it fails**

Run: `node --test frontend/desktop/js/barangay-admin.test.mjs`
Expected: FAIL because the Barangay Admin page has no tab controls.

- [x] **Step 3: Group the existing sections and wire tab state**

Wrap the four dashboard areas in tab panels and add semantic tab buttons with `aria-controls`. Synchronize active classes, `aria-selected`, and panel `hidden` state. Keep existing palette and component classes.

- [x] **Step 4: Run the Barangay Admin tests**

Run: `node --test frontend/desktop/js/barangay-admin.test.mjs`
Expected: PASS, including existing booking and assignment behavior.

### Task 2: Standardize Admin Attraction Category Dropdowns

**Files:**
- Modify: `frontend/shared/js/state.js`
- Modify: `apps/desktop/admin.html`
- Modify: `apps/desktop/barangay-admin.html`
- Modify: `frontend/desktop/features/attractions/attractions.js`
- Modify: `frontend/desktop/js/barangay-admin.js`
- Test: `frontend/desktop/js/approval-workflow.test.mjs`
- Test: `frontend/desktop/js/barangay-admin.test.mjs`

**Interfaces:**
- Produces: `window.ATTRACTION_CATEGORIES` with `Adventure`, `Hiking`, `Camping`, `Historical`, `Falls`; editing an existing attraction appends its previously saved category if it is not standard.

- [x] **Step 1: Write failing tests for agreed categories and legacy preservation**

Test that both admin save paths submit the selected category and editing with a saved category outside the standard list keeps it selected.

- [x] **Step 2: Run the tests and verify the compatibility case fails**

Run: `node --test frontend/desktop/js/approval-workflow.test.mjs frontend/desktop/js/barangay-admin.test.mjs`
Expected: FAIL because category inputs are free-text and have no shared option list.

- [x] **Step 3: Add shared category options to both forms**

Define the agreed categories once in `frontend/shared/js/state.js`, replace both admin text inputs with selects, and append an existing nonstandard value when editing so saved data is not silently rewritten.

- [x] **Step 4: Run the category workflow tests**

Run: `node --test frontend/desktop/js/approval-workflow.test.mjs frontend/desktop/js/barangay-admin.test.mjs`
Expected: PASS, including unchanged category values in submissions and edits.

### Task 3: Expose Municipal Admin Attraction Editing

**Files:**
- Modify: `apps/desktop/admin.html`
- Modify: `frontend/desktop/features/attractions/attractions.js`
- Modify: `frontend/desktop/js/portal.js`
- Test: `frontend/desktop/features/attractions/attractions.test.mjs` (create)
- Test: `frontend/desktop/js/portal.test.mjs`

**Interfaces:**
- Consumes: Existing admin attraction cards, `window.AdminAttractionsFeature`, and current `updateState` persistence/error path.
- Produces: `window.AdminAttractionsFeature.selectForEdit(attraction)`, Edit actions, and a reachable Add/Edit panel populated with the selected attraction.

- [x] **Step 1: Write the failing edit-action test**

Test that Edit populates name, category, detail fields, and saved coordinates. Add a portal test that verifies the edit panel is visible.

- [x] **Step 2: Run the tests and verify they fail**

Run: `node --test frontend/desktop/features/attractions/attractions.test.mjs frontend/desktop/js/portal.test.mjs`
Expected: FAIL because cards have no edit controls and the form panel has no reachable tab.

- [x] **Step 3: Initialize and wire the existing edit form**

Initialize the form once after state loads. Expose it as an Add/Edit tab and implement `selectForEdit(attraction)` to populate it from the selected record. Add card Edit actions that call this method. Preserve existing coordinates when changing other details and use the existing persistence/error path without duplicate submit handlers on dashboard refresh.

- [x] **Step 4: Run the Municipal Admin tests**

Run: `node --test frontend/desktop/features/attractions/attractions.test.mjs frontend/desktop/js/portal.test.mjs`
Expected: PASS, including existing admin tab navigation and save-error behavior.
