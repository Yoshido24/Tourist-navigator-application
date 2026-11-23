import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('requires CAPTCHA for tourist attraction bookings', async () => {
  let submit;
  let requestBody;
  let renderedKey;
  let reset = false;
  const form = {
    dataset: {},
    elements: { terms: { checked: true } },
    addEventListener: (name, handler) => { if (name === 'submit') submit = handler; },
    querySelector: () => ({ disabled: false }),
    reset() {}
  };
  const elements = {
    'booking-form': form,
    'booking-captcha': {},
    'booking-error': { hidden: true },
    'booking-success': { hidden: true }
  };
  const window = {
    grecaptcha: {
      render(_container, options) { renderedKey = options.sitekey; return 1; },
      getResponse: () => 'verified-token',
      reset() { reset = true; }
    }
  };
  const context = vm.createContext({
    window,
    document: {
      getElementById: (id) => elements[id] || null,
      createElement: () => ({}),
      head: { appendChild() { window.onRecaptchaLoaded(); } }
    },
    appState: { attractions: [{ id: 'a1', barangay_id: 'b1' }] },
    createBookingFromForm: () => ({ attractionId: 'a1' }),
    supabaseClient: {
      functions: {
        invoke: async (_name, options) => {
          requestBody = options.body;
          return { data: { ok: true }, error: null };
        }
      }
    }
  });
  vm.runInContext(readFileSync(new URL('../../../shared/config/supabase.public.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('./booking.js', import.meta.url), 'utf8'), context);
  context.window.UserBookingFeature.setup(context.appState);
  await new Promise((resolve) => setImmediate(resolve));
  await submit({ preventDefault() {} });
  assert.ok(renderedKey);
  assert.equal(requestBody.captchaToken, 'verified-token');
  assert.equal(reset, true);
});

test('shows why an unassigned attraction cannot be booked before calling the API', async () => {
  let submit;
  let apiCalls = 0;
  const error = { hidden: true, textContent: '' };
  const form = {
    dataset: {},
    elements: { terms: { checked: true } },
    addEventListener: (name, handler) => { if (name === 'submit') submit = handler; },
    querySelector: () => ({ disabled: false }),
    reset() {}
  };
  const context = vm.createContext({
    window: {},
    document: { getElementById: (id) => ({ 'booking-form': form, 'booking-error': error }[id] || null) },
    appState: { attractions: [{ id: 'legacy', barangay_id: null }] },
    createBookingFromForm: () => ({ attractionId: 'legacy' }),
    supabaseClient: { functions: { invoke: async () => { apiCalls += 1; return { data: { ok: true }, error: null }; } } }
  });
  vm.runInContext(readFileSync(new URL('./booking.js', import.meta.url), 'utf8'), context);
  context.window.UserBookingFeature.setup(context.appState);
  await submit({ preventDefault() {} });
  assert.equal(apiCalls, 0);
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /barangay/i);
});
