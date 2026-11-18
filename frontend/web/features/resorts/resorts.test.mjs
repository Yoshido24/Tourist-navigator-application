import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('tourist resort listings show approved photos and services', async () => {
  const photo = { dataset: { resortPhotoIndex: '0' }, innerHTML: '' };
  const list = {
    innerHTML: '',
    querySelectorAll(selector) {
      return selector === '[data-resort-photo-index]' && this.innerHTML.includes('data-resort-photo-index') ? [photo] : [];
    }
  };
  const window = {};
  const context = vm.createContext({
    window,
    document: { getElementById: (id) => id === 'resort-list' ? list : null },
    SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test',
    supabase: { createClient: () => ({ storage: { from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: 'https://example.supabase.co/approved-photo' } })
    }) } }) },
    console
  });
  vm.runInContext(readFileSync(new URL('../../../shared/js/state.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('./resorts.js', import.meta.url), 'utf8'), context);
  window.UserResortsFeature.render({
    resorts: [{ id: 'one', name: 'Sunset', images: ['approved-photo'], services: [{ name: 'Pool', fee: 100, pricingUnit: 'person' }] }],
    barangays: []
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(list.innerHTML, /Pool/);
  assert.match(photo.innerHTML, /approved-photo/);
});
