# Tourist Map Category Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let tourists filter map pins and attraction results by category and find approved, accurately located resorts on the map.

**Architecture:** Keep one active category in the tourist discovery feature, feed the same filtered results into attraction lists and map pins, and render resorts from approved `state.resorts` only when coordinates are valid. Resort map details open the existing Resort tab with that resort selected.

**Tech Stack:** HTML, CSS, classic browser JavaScript, Leaflet, Node.js test runner.

**Spec:** `docs/superpowers/specs/2026-11-18-resort-barangay-map-workflows-design.md`

**Dependencies:** Resort coordinates from `2026-11-18-resort-registration-map-listings.md` Task 2 and shared categories from `2026-11-18-admin-navigation-and-attraction-editing.md` Task 2.

## Global Constraints

- Continue using the existing Supabase auth, RLS, approval functions, and page/component patterns; do not add dependencies.
- Keep the existing visual palette, typography, and shared UI styling; add navigation and controls using current components rather than redesigning the portals.
- Public resort reads continue through the `public_resorts` security-invoker view, exposing only approved public listing fields.
- Store coordinates with the same latitude/longitude semantics used for attraction pins. Do not geocode addresses or substitute a barangay center.
- No push/email notifications, new staff roles, changes to booking lifecycle, or changes to payment/availability handling.
- No automatic changes to existing attraction categories or resort listings.

## Review Focus

- `All` includes uncategorized attractions: test through `filterByCategory`.
- Category matching is case-insensitive and trims whitespace: test mixed-case and padded saved category strings.
- Existing nonstandard categories remain discoverable: test dynamic options and filtering for a legacy value.
- Resorts without valid coordinates get no fallback or map pin: test null and invalid coordinates.
- Resort pins render when there are no attraction records: test Resort filter with an empty attraction array.
- Only approved resorts from `public_resorts` are mapped, and map-to-booking selects the same resort: test render/selection callback.

---

### Task 1: Add Tourist Category Selectors

**Files:**
- Modify: `apps/web/user.html`
- Modify: `frontend/web/features/attractions/attractions.js`
- Test: `frontend/web/features/attractions/attractions.test.mjs`

**Interfaces:**
- Consumes: `window.ATTRACTION_CATEGORIES` from Admin Task 2.
- Produces: Accessible selectors on Map and Attractions with All, five agreed attraction categories, Resort, and saved legacy categories.

- [x] **Step 1: Write failing selector/filter tests**

Test Falls filtering, All including uncategorized items, normalized category matching, and legacy category discoverability.

- [x] **Step 2: Run the tests and verify they fail**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs`
Expected: FAIL because current filters are fixed buttons and do not include Falls.

- [x] **Step 3: Replace category buttons with synchronized selects**

Add native selects to Map and Attractions, populated from shared categories plus All, Resort, and saved legacy categories. Synchronize both to one active category.

- [x] **Step 4: Run attraction tests**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs`
Expected: PASS, including legacy values and All.

### Task 2: Filter Attraction Map Pins with the Active Category

**Files:**
- Modify: `frontend/web/features/attractions/attractions.js`
- Modify: `frontend/web/features/map/map.js`
- Test: `frontend/web/features/attractions/attractions.test.mjs`
- Test: `frontend/web/features/map/map.test.mjs`

**Interfaces:**
- Consumes: Active category and `filterByCategory(attractions, category)` from the tourist attraction feature.
- Produces: `UserMapFeature` renders only attractions matching the active category and retains pin selection.

- [x] **Step 1: Write failing map-filter tests**

Test Falls shows only matching markers/buttons; All includes categorized and uncategorized attractions.

- [x] **Step 2: Run the tests and verify they fail**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs frontend/web/features/map/map.test.mjs`
Expected: FAIL because the map currently always renders every attraction.

- [x] **Step 3: Apply active category to map rendering**

Pass the current category into map rendering and use the shared filter helper for markers and the accessible pin list. Preserve selection, popups, and booking behavior.

- [x] **Step 4: Run map and attraction tests**

Run: `node --test frontend/web/features/attractions/attractions.test.mjs frontend/web/features/map/map.test.mjs`
Expected: PASS with category-consistent lists and pins.

### Task 3: Add Resort Map Pins and Booking Navigation

**Files:**
- Modify: `frontend/web/features/map/map.js`
- Modify: `frontend/web/features/resorts/resorts.js`
- Test: `frontend/web/features/map/map.test.mjs`
- Test: `frontend/web/features/resorts/resorts.test.mjs` (create)

**Interfaces:**
- Consumes: `state.resorts` with nullable `coords` public field from Resort Task 2.
- Produces: Pins and accessible results for approved public resorts with valid coordinates; selecting a pin shows services/fees and opens that resort in the existing Resort tab.

- [x] **Step 1: Write failing resort map tests**

Test valid resorts appear under Resort even with no attractions, invalid/missing coordinates create no pin, and selecting a resort pin shows services/fees and opens the Resort tab with that resort selected.

- [x] **Step 2: Run tests and verify they fail**

Run: `node --test frontend/web/features/map/map.test.mjs frontend/web/features/resorts/resorts.test.mjs`
Expected: FAIL because the map renders attractions only and resorts expose no map-selection entry point.

- [x] **Step 3: Render resort pins and connect the Resort feature**

Render only valid-coordinate resorts from `state.resorts` for category Resort. Show public services/fees and add a button opening the Resort tab with that resort selected for booking. Do not invent coordinates for legacy listings.

- [x] **Step 4: Run map and resort tests**

Run: `node --test frontend/web/features/map/map.test.mjs frontend/web/features/resorts/resorts.test.mjs`
Expected: PASS, including no fallback for missing or invalid coordinates.
