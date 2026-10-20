Shared state boundary

state.js contains only shared application state and persistence:
- persistence: Supabase and IndexedDB loading/saving
- state: attractions, bookings, guides, and shop products
- reusable data helpers used by portal bundles

Portal rendering and event handlers are intentionally separated:
- frontend/web/js/portal.js
- frontend/desktop/js/portal.js
- frontend/mobile/js/portal.js

New portal-specific behavior belongs in the corresponding portal folder.
