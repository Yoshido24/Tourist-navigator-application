import { createSecureBookingHandler } from '../_shared/secure-booking.mjs';

Deno.serve(createSecureBookingHandler({
  env: {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    RECAPTCHA_SECRET_KEY: Deno.env.get('RECAPTCHA_SECRET_KEY'),
    RECAPTCHA_ENABLED: Deno.env.get('RECAPTCHA_ENABLED')
  }
}));
