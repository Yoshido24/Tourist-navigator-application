import { createLocalAccountsHandler } from '../_shared/local-accounts.mjs';

Deno.serve(createLocalAccountsHandler({
  env: {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  }
}));
