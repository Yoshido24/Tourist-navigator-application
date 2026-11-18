import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('municipal product form accepts an uploaded picture file', () => {
  const html = readFileSync(new URL('../../../../apps/desktop/admin.html', import.meta.url), 'utf8');
  assert.match(html, /id="shop-product-image"[^>]*type="file"[^>]*required/);
});

test('a failed municipal product save remains visible and does not clear the form', async () => {
  let submit;
  let inserted;
  const removed = [];
  let reset = false;
  const photoFile = { name: 'product.png', type: 'image/png', size: 20 };
  const form = {
    dataset: {}, addEventListener(_, fn) { submit = fn; }, reset() { reset = true; }
  };
  const message = { textContent: '', hidden: true };
  const window = {};
  const context = vm.createContext({
    window, document: { getElementById: (id) => id === 'add-shop-product-form' ? form : message },
    FormData: class { get(name) { return name === 'image' ? photoFile : 'Test'; } },
    USE_SUPABASE: true,
    supabaseClient: { from: () => ({ insert: async (product) => { inserted = product; return { error: new Error('Database unavailable') }; } }) },
    uploadShopProductPhoto: async () => ({ path: 'photo.png', url: 'https://example.test/photo.png' }),
    removeShopProductPhoto: async (path) => { removed.push(path); },
    updateState: async () => {}, Date
  });
  vm.runInContext(readFileSync(new URL('./shop.js', import.meta.url), 'utf8'), context);
  window.AdminShopFeature.setup();
  await submit({ preventDefault() {} });
  assert.equal(reset, false);
  assert.equal(message.hidden, false);
  assert.match(message.textContent, /Database unavailable/);
  assert.equal(inserted.image, 'https://example.test/photo.png');
  assert.deepEqual(removed, ['photo.png']);
});
