import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

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
