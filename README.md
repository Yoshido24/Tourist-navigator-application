# Tourist Navigator Application

A multi-platform navigator for local tourist attractions in Montalban.

## Project structure

```text
apps/
  web/       Public, responsive tourist experience
  mobile/    Guide experience, designed mobile-first
  desktop/   Admin dashboard
frontend/
  shared/    Shared styles, browser logic, and public Supabase settings
    css/      Shared stylesheet
    js/       Shared application runtime
    config/   Public client configuration
  web/       Tourist portal assets and feature folders
  mobile/    Guide portal assets and feature folders
  desktop/   Admin portal assets and feature folders
backend/
  database/  Supabase SQL migrations
```

Portal-specific CSS and JavaScript live under `frontend/web`, `frontend/mobile`,
and `frontend/desktop`. Each portal loads the shared state module and its own
portal bundle:

- `frontend/web/js/portal.js` contains the tourist map, attractions, booking,
  directions, and Mini Shop experience.
- `frontend/desktop/js/portal.js` contains attraction, transport, booking,
  guide, and admin shop management.
- `frontend/mobile/js/portal.js` contains guide schedules, assigned bookings,
  and visitor lists.

The shared [state.js](frontend/shared/js/state.js) contains only shared storage,
state updates, and reusable data helpers. The shared CSS entry point is
[styles.css](frontend/shared/css/styles.css), which contains the foundation
and layout primitives. Portal component styles live in each portal's
`css/portal-components.css`.

## Open an app

- [Web user app](apps/web/user.html)
- [Mobile guide app](apps/mobile/guide.html)
- [Desktop admin app](apps/desktop/admin.html)

Open [index.html](index.html) to enter the project from the public web app. It is responsive at phone, tablet, and desktop widths. The root `index.html`, `user.html`, `guide.html`, and `admin.html` remain as redirects so existing bookmarks still work.

## Supabase backend setup

1. Create a project at [Supabase](https://supabase.com).
2. Create the `attractions`, `bookings`, `guides`, and `shop_products` tables. The `attractions` table also uses `transportOptions`; bookings use `assignedGuide`, `time`, `meetingPoint`, and `scheduleNotes`; shop products use `name`, `price`, `description`, `availability`, and `image`.
3. Add the project URL and publishable/anon key to `frontend/shared/config/supabase.public.js`.
4. Run [supabase-attractions-map.sql](backend/database/supabase-attractions-map.sql) in the Supabase SQL Editor.
5. Before deploying, enable Row Level Security and give only authenticated admins write permission. Do not put a service-role key in any front-end file.

When no Supabase connection is configured, the app falls back to IndexedDB in the browser. New installations start empty; admins can add attractions, guides, bookings, and shop products from the portals.
