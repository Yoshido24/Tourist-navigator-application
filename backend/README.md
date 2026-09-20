# Backend

The project uses Supabase as its backend. Database changes belong in `database/` and should be run in the Supabase SQL Editor.

The browser uses only the publishable Supabase key from `frontend/shared/config/supabase.public.js`. Never put a Supabase service-role key in a browser file. Enforce admin permissions with Supabase Auth and Row Level Security policies before deploying.
