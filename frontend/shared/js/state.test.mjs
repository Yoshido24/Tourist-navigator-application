import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const statePath = new URL('./state.js', import.meta.url);

test('saving a shop edit does not delete or overwrite products added by another admin', async () => {
  const rows = new Map([
    ['old', { id: 'old', name: 'Updated elsewhere' }],
    ['new', { id: 'new', name: 'Newly approved' }]
  ]);
  const client = {
    from: () => ({
      select: async () => ({ data: [...rows.values()], error: null }),
      delete: () => ({ in: async (_, ids) => { ids.forEach((id) => rows.delete(id)); return { error: null }; } }),
      upsert: async (items) => { items.forEach((item) => rows.set(item.id, item)); return { error: null }; }
    })
  };
  const context = vm.createContext({
    window: {}, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test',
    supabase: { createClient: () => client }, console
  });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  context.previous = [{ id: 'old', name: 'Old' }];
  context.next = [{ id: 'old', name: 'Old' }, { id: 'added', name: 'Local product' }];
  await vm.runInContext("persistSupabaseCollection('shop_products', next, { previousItems: previous })", context);
  assert.equal(rows.get('new').name, 'Newly approved');
  assert.equal(rows.get('old').name, 'Updated elsewhere');
  assert.equal(rows.get('added').name, 'Local product');
});

test('keeps rejected resort booking decisions visible instead of resetting them to Pending', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  const status = vm.runInContext("normalizeBooking({ status: 'Rejected' }).status", context);
  assert.equal(status, 'Rejected');
});

test('maps trusted municipal admin roles to the existing global admin portal access', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  const roles = vm.runInContext(`[
    getSessionRole({ user: { app_metadata: { role: 'admin' } } }),
    getSessionRole({ user: { app_metadata: { role: 'municipal_super_admin' } } }),
    getSessionRole({ user: { app_metadata: { role: 'barangay_admin' } } }),
    getSessionRole({ user: { app_metadata: { role: 'resort_manager' } } }),
    getSessionRole({ user: { user_metadata: { role: 'admin' } } }),
    getSessionRole(null)
  ]`, context);
  assert.deepEqual(Array.from(roles), ['admin', 'admin', 'authenticated', 'authenticated', 'authenticated', 'anon']);
});

test('escapes dynamic text for standalone portals', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  const escaped = vm.runInContext("escapeHtml(`<script attr=\"x\">'&</script>`)", context);
  assert.equal(escaped, '&lt;script attr=&quot;x&quot;&gt;&#39;&amp;&lt;/script&gt;');
});

test('loads public resorts and barangays into the tourist portal state', async () => {
  const rows = {
    attractions: [],
    bookings: [],
    guides: [],
    shop_products: [],
    public_resorts: [{ id: 'resort-1', name: 'Sunset Resort', services: [] }],
    barangays: [{ id: 'b1', name: 'San Rafael' }]
  };
  const queriedTables = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    from: (table) => {
      queriedTables.push(table);
      return { select: async () => ({ data: rows[table] || [], error: null }) };
    }
  };
  const context = vm.createContext({
    window: { localStorage: { getItem: () => null, setItem: () => {} } },
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_ANON_KEY: 'test-key',
    supabase: { createClient: () => client }
  });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  const state = await vm.runInContext('loadStateFromSupabase()', context);
  assert.equal(state.resorts[0].name, 'Sunset Resort');
  assert.equal(state.barangays[0].name, 'San Rafael');
  assert.ok(queriedTables.includes('public_resorts'));
});
