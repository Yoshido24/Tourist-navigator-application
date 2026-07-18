# Tourist-navigator-application

A multi-platform navigator concept for local tourist attractions in Montalban.

## What this prototype includes
- A mobile-friendly landing page for tourists
- Sections for attractions, features, and booking flow
- Clear role-based views for tourists, tour guides, and admins
- A simple interactive UI for the app concept

## Project files
- [index.html](index.html) — main app structure and content
- [styles.css](styles.css) — visual design and responsive layout
- [script.js](script.js) — small interactions such as role-card selection

## How to view it
Open [index.html](index.html) in your browser to preview the prototype.

## Supabase setup
1. Create a new project at https://app.supabase.com
2. Set up three tables: `attractions`, `bookings`, and `guides`
3. Copy your project URL and anon key into `supabase-config.js`
4. Open any page in a browser. The app will seed the tables on first load and use Supabase for data storage when configured.
