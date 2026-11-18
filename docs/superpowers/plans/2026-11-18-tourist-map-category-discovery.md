# Tourist Map Category Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tourists filter map pins and attraction results by category and find approved, accurately located resorts from the map.

**Architecture:** Keep a single active category in the tourist discovery feature, feed the same filtered results into the attraction list and map, and render resort pins from approved `state.resorts` only when valid coordinates are present. Resort map details open the existing Resort tab with that resort selected.

**Tech Stack:** HTML, CSS, classic browser JavaScript, Leaflet, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-18-resort-barangay-map-workflows-design.md`

**Dependencies:** Complete the resort coordinate work in `2026-11-18-resort-registration-map-listings.md` and the shared category list in Task 2 of `2026-11-18-admin-navigation-and-attraction-editing.md` before implementing this plan.

## Global Constraints

- Continue using the existing Supabase auth, RLS, approval functions, and page/component patterns; do not add dependencies.
- Keep the existing visual palette, typography, and shared UI styling; add navigation and controls using current components rather than redesigning the portals.
- Public resort reads continue through the `public_resorts` security-invoker view, exposing only approved public listing fields.
- Store coordinates with the same latitude/longitude semantics used for attraction pins. Do not geocode addresses or substitute a barangay center.
- No push/email notifications, new staff roles, changes to booking lifecycle, or changes to payment/availability handling.
- No automatic changes to existing attraction categories or resort listings.

## Review Focus

- `All` must continue to include uncategorized attractions: test through `filterByCategory`.
- Category matching must remain case-insensitive and trim surrounding whitespace: test mixed-case and padded saved category strings.
- Existing nonstandard categories must remain discoverable: test dynamic dropdown options and filtering for a legacy saved category.
- Resorts without coordinates must not be assigned a fallback location or rendered as map pins: test the map with null and invalid coordinates.
- Resort pins must render when there are no attraction records: test the Resort category with an empty attractions array.
- Only approved resorts from `public_resorts` can be mapped, and map-to-booking navigation must select the same resort: test the render and selection callback.

---

### Task 1: Add Tourist Category Selectors

**Files:**
- Modify: `apps/web/user.html`
- Modify: `frontend/web/features/attractions/attractions.js`
- Test: `frontend/web/features/attractions/attractions.test.mjs`

**Interfaces:**
- Consumes: `window.ATTRACTION_CATEGORIES` from the Admin Navigation and Attraction Editing plan.
- Produces: Accessible category selects on the Map and Attractions views with `All`, the five agreed attraction categories, and `Resort`; saved nonstandard attraction categories are also available.

- [ ] **Step 1: Write the failing selector/filter tests**

Test that selecting `Falls` filters the list, `All` includes uncategorized attractions, matching ignores case and surrounding whitespace, and an existing nonstandard category remains selectable.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs`
Expected: FAIL because category controls are currently fixed buttons and do not include Falls.

- [ ] **Step 3: Replace category buttons with synchronized selects**

Add native `<select>` controls to the Map and Attractions views. Populate both from the shared attraction category values plus `All`, `Resort`, and any saved legacy categories. Keep both controls synchronized with one active category.

- [ ] **Step 4: Run the attraction tests**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs`
Expected: PASS, including legacy values and `All`.

### Task 2: Filter Attraction Map Pins with the Active Category

**Files:**
- Modify: `frontend/web/features/attractions/attractions.js`
- Modify: `frontend/web/features/map/map.js`
- Test: `frontend/web/features/attractions/attractions.test.mjs`
- Test: `frontend/web/features/map/map.test.mjs`

**Interfaces:**
- Consumes: The active category and `filterByCategory(attractions, category)` from the tourist attraction feature.
- Produces: `UserMapFeature` renders only attractions matching the active category and maintains the existing pin detail and attraction-selection behavior.

- [ ] **Step 1: Write the failing map-filter tests**

Test that choosing Falls renders only Falls markers and pin buttons, while `All` includes categorized and uncategorized attraction pins.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs frontend/web/features/map/map.test.mjs`
Expected: FAIL because the map currently always renders every attraction.

- [ ] **Step 3: Apply the active category to map rendering**

Pass the current category into map rendering and use the shared filter helper for both markers and the accessible pin list. Do not alter attraction selection, popups, or booking behavior.

- [ ] **Step 4: Run the map and attraction tests**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs frontend/web/features/map/map.test.mjs`
Expected: PASS with category-consistent lists and pins.

### Task 3: Add Resort Map Pins and Booking Navigation

**Files:**
- Modify: `frontend/web/features/map/map.js`
- Modify: `frontend/web/features/resorts/resorts.js`
- Test: `frontend/web/features/map/map.test.mjs`
- Test: `frontend/web/features/resorts/resorts.test.mjs` (create)

**Interfaces:**
- Consumes: `state.resorts` with the nullable `coords` public field from the Resort Registration and Map Listings plan.
- Produces: Resort map pins and accessible results for approved public resorts with valid coordinates; selecting a resort opens its public service details and the existing Resort tab booking flow.

- [ ] **Step 1: Write failing resort map tests**

Test that a resort with valid coordinates appears under `Resort` even when there are no attractions, a null/out-of-range coordinate does not create a pin, and selecting a resort pin shows its services/fees and opens the Resort tab with that resort selected.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `node --test frontend/web/features/map/map.test.mjs frontend/web/features/resorts/resorts.test.mjs`
Expected: FAIL because the map currently renders attractions only and the resort feature exposes no map-selection entry point.

- [ ] **Step 3: Render resort pins and connect the existing Resort feature**

Render only valid-coordinate resorts from `state.resorts` when the active category is `Resort`. Show public services and fees in the selected map details and add a button that opens the existing Resort tab with the same resort selected for booking. Do not invent coordinates for legacy listings.

- [ ] **Step 4: Run the map and resort tests**

Run: `node --test frontend/web/features/map/map.test.mjs frontend/web/features/resorts/resorts.test.mjs`
Expected: PASS, including no map fallback for missing or invalid coordinates.
