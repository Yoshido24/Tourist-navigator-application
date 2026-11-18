import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('a failed municipal product save remains visible and does not clear the form', async () => {
  let submit;
  let reset = false;
  const form = {
    dataset: {}, addEventListener(_, fn) { submit = fn; }, reset() { reset = true; }
  };
  const message = { textContent: '', hidden: true };
  const window = {};
  const context = vm.createContext({
    window, document: { getElementById: (id) => id === 'add-shop-product-form' ? form : message },
    FormData: class { get() { return 'Test'; } },
    USE_SUPABASE: true,
    supabaseClient: { from: () => ({ insert: async () => ({ error: new Error('Database unavailable') }) }) },
    updateState: async () => {}, Date
  });
  vm.runInContext(readFileSync(new URL('./shop.js', import.meta.url), 'utf8'), context);
  window.AdminShopFeature.setup();
  await submit({ preventDefault() {} });
  assert.equal(reset, false);
  assert.equal(message.hidden, false);
  assert.match(message.textContent, /Database unavailable/);
});
