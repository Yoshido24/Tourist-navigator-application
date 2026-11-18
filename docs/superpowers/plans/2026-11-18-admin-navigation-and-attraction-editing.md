# Admin Navigation and Attraction Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Barangay Admins tabbed access to their existing workflows and make Municipal Admin attraction editing straightforward without changing role permissions.

**Architecture:** Group the existing Barangay Admin sections behind accessible tab controls in the current page and JavaScript. Reuse the current attraction form and `updateState` save path for Municipal Admin edits, while providing one shared attraction category list to both admin forms and preserving existing category values.

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

- A Barangay Admin assigned to multiple areas must retain all current scoped content: keep the existing dashboard loading tests passing.
- An unassigned Barangay Admin must not see unrelated listings or bookings: keep the no-assignment empty-state behavior unchanged.
- Tab navigation must leave exactly one panel visible and update `aria-selected`: add a focused tab-switch test.
- Existing nonstandard category strings must remain selectable during edits: add a legacy-category edit test.
- Editing attraction details must preserve its existing coordinates unless the admin explicitly changes the location: add an edit-save regression test.

---

### Task 1: Add Barangay Admin Tabs

**Files:**
- Modify: `apps/desktop/barangay-admin.html`
- Modify: `frontend/desktop/js/barangay-admin.js`
- Test: `frontend/desktop/js/barangay-admin.test.mjs`

**Interfaces:**
- Consumes: The existing dashboard sections and DOMContentLoaded startup.
- Produces: Four tabs named `Attractions and shop products`, `Existing attractions`, `Attraction bookings`, and `Resort listings to review`; assigned-area data loading and permissions remain unchanged.

- [ ] **Step 1: Write the failing tab-switch test**

Add a test that selects each tab and asserts that only its panel is visible, the selected tab has `aria-selected="true"`, and the other tabs have `aria-selected="false"`.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test frontend/desktop/js/barangay-admin.test.mjs`
Expected: FAIL because the Barangay Admin page has no tab controls.

- [ ] **Step 3: Group the existing sections and wire tab state**

Wrap the four existing dashboard areas in tab panels and add semantic tab buttons with `aria-controls`. Add a small setup function in `barangay-admin.js` that synchronizes active classes, `aria-selected`, and panel `hidden` state. Keep the existing palette and component classes.

- [ ] **Step 4: Run the Barangay Admin tests**

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
- Produces: `window.ATTRACTION_CATEGORIES` with `Adventure`, `Hiking`, `Camping`, `Historical`, and `Falls`; editing an existing attraction appends its previously saved category if it is not in this list.

- [ ] **Step 1: Write failing tests for the agreed categories and legacy preservation**

Test that both admin save paths still submit the selected category and that editing an attraction with a saved category outside the standard list keeps that value selected rather than replacing it.

- [ ] **Step 2: Run the tests and verify the compatibility case fails**

Run: `node --test frontend/desktop/js/approval-workflow.test.mjs frontend/desktop/js/barangay-admin.test.mjs`
Expected: FAIL because category inputs are currently free-text and have no shared option list.

- [ ] **Step 3: Add shared category options to both forms**

Define the agreed category values once in `frontend/shared/js/state.js`, replace both admin text inputs with selects, and append an existing nonstandard value when editing so saved data is not silently rewritten.

- [ ] **Step 4: Run the category workflow tests**

Run: `node --test frontend/desktop/js/approval-workflow.test.mjs frontend/desktop/js/barangay-admin.test.mjs`
Expected: PASS, including unchanged category values in attraction submissions and edits.

### Task 3: Expose Municipal Admin Attraction Editing

**Files:**
- Modify: `apps/desktop/admin.html`
- Modify: `frontend/desktop/features/attractions/attractions.js`
- Modify: `frontend/desktop/js/portal.js`
- Test: `frontend/desktop/features/attractions/attractions.test.mjs` (create)
- Test: `frontend/desktop/js/portal.test.mjs`

**Interfaces:**
- Consumes: Existing admin attraction cards, `window.AdminAttractionsFeature`, and the current `updateState` persistence/error path.
- Produces: `window.AdminAttractionsFeature.selectForEdit(attraction)`, a discoverable Edit action on each attraction, and an Add/Edit form panel that opens with the selected attraction populated.

- [ ] **Step 1: Write the failing edit-action test**

Add a feature test that clicks Edit on an existing attraction and verifies the form receives its name, category, detail fields, and saved coordinates. Add a portal test that verifies the edit panel is made visible.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test frontend/desktop/features/attractions/attractions.test.mjs frontend/desktop/js/portal.test.mjs`
Expected: FAIL because attraction cards currently have no edit controls and the form panel has no reachable tab.

- [ ] **Step 3: Initialize and wire the existing edit form**

Initialize the admin attraction form once after state loads. Expose the form as an Add/Edit tab and implement `window.AdminAttractionsFeature.selectForEdit(attraction)` to populate it from the selected current record. Add Edit actions to attraction cards that call this method. Preserve existing coordinates when changing other details and use the current `updateState` persistence/error path without binding duplicate submit handlers on dashboard refresh.

- [ ] **Step 4: Run the Municipal Admin tests**

Run: `node --test frontend/desktop/features/attractions/attractions.test.mjs frontend/desktop/js/portal.test.mjs`
Expected: PASS, including existing admin tab navigation and save-error behavior.
