# Resort, Barangay, and Map Workflows

## Intent

Make resort applications and listings easier to complete and review, give Barangay Admins clear navigation to their local work, and let tourists filter both attractions and resorts on the map.

## Why

The current account-creation error suggests a duplicate email for every rejected Supabase signup, so it can conceal unrelated failures. Municipal approval and resort listing review already exist, but the management experience is split across pages. Barangay sections are stacked in one long page, Municipal Admin attraction cards have no edit action, and tourist category filters affect the attraction list but not map pins. Resort listings have no coordinates and therefore cannot be placed accurately on the map.

## Goals

- Report resort signup failures accurately without exposing raw auth-provider details or weakening duplicate-account handling.
- Keep Municipal Admin review as the gate that grants resort-manager access. A pending owner may sign in to see application status, but cannot manage listings until approval.
- Let an approved owner choose the exact resort location when setting up or editing the listing. Only a barangay-approved listing is public.
- Filter tourist map pins and the matching results by attraction category or Resort.
- Provide category dropdowns for attraction entry and tourist discovery.
- Present Barangay Admin work as tabs and make Municipal Admin attraction editing discoverable.

## Agreed behavior

### Resort application and listing

1. A resort owner submits an account application. The pending application appears in the Municipal Admin's existing in-portal review queue; no email, push, or external notification service is added.
2. Municipal approval creates the manager record. A pending owner can sign in to view status, but the listing dashboard remains unavailable until approval.
3. After approval, the owner sets up a listing, adds services and fees, and selects an exact map pin. The listing's selected barangay determines which Barangay Admin reviews it; the application barangay is the initial default.
4. On barangay approval, the public resort listing, services, and saved coordinates become available to tourists. Rejected or pending edits do not replace the currently approved listing.
5. Existing public listings without coordinates remain visible in the Resort listings page but do not get an inaccurate map pin until their owner submits a location.

### Tourist map and categories

- The map's category selector has `All`, `Adventure`, `Hiking`, `Camping`, `Historical`, `Falls`, and `Resort`.
- Selecting an attraction category filters both attraction results and pins. Selecting `Resort` shows approved resorts with saved coordinates; resort map details include its public services and fees, and a button opens the existing Resort tab with that resort selected for booking.
- Keep the existing Resort listings page and booking flow. A map pin supplements, rather than replaces, those screens.
- Attraction entry uses dropdowns for the agreed categories. Previously saved category values must remain visible and editable; they must not be silently rewritten.

### Admin navigation and editing

- Barangay Admin gets four tabs: `Attractions and shop products`, `Existing attractions`, `Attraction bookings`, and `Resort listings to review`.
- Existing barangay assignment scoping, submission approval flow, and booking permissions remain unchanged.
- Municipal Admin can open an existing attraction from the attraction list, edit its details, and save through the existing admin write path. Barangay Admin editing remains scoped to assigned barangays.

### Signup errors

- Keep a duplicate-safe response for known duplicate-account cases.
- For other auth-provider rejection or service failures, show a distinct, safe message rather than claiming the email may already be registered.
- Do not return raw provider response bodies or log credentials/personal data.

## Constraints and non-goals

- Continue using the existing Supabase auth, RLS, approval functions, and page/component patterns; do not add dependencies.
- Keep the existing visual palette, typography, and shared UI styling; add navigation and controls using current components rather than redesigning the portals.
- Public resort reads continue through the `public_resorts` security-invoker view, exposing only approved public listing fields.
- Store coordinates with the same latitude/longitude semantics used for attraction pins. Do not geocode addresses or substitute a barangay center.
- No push/email notifications, new staff roles, changes to booking lifecycle, or changes to payment/availability handling.
- No automatic changes to existing attraction categories or resort listings.

## Acceptance criteria

- A duplicate signup is still rejected without creating an application or deleting an existing account; unrelated signup failures no longer receive a duplicate-email message.
- A pending resort owner cannot manage a listing; after municipal approval, they can add services and submit an accurately located listing for barangay review.
- Only barangay-approved resort listings with saved coordinates appear under Resort on the map; selecting a resort pin shows services/fees and opens that resort in the existing Resort tab for booking. The existing Resort page continues to show approved listings, including older listings with no coordinates.
- Choosing Falls shows only Falls attractions in both the results and map; All continues to include uncategorized attractions.
- The four Barangay Admin tabs expose their existing sections and retain the current role/area restrictions.
- Municipal Admin can edit an existing attraction and persist the changes; Barangay Admin remains limited to assigned areas.
