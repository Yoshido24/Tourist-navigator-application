import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const statePath = new URL('./state.js', import.meta.url);

test('attraction photos keep checked photos and upload new files to public storage', async () => {
  const uploads = [];
  const context = vm.createContext({
    window: {}, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test',
    crypto: { randomUUID: () => 'new-id' },
    supabase: { createClient: () => ({ storage: { from: (bucket) => ({
      upload: async (path) => { uploads.push(`${bucket}/${path}`); return { error: null }; },
      remove: async () => ({ error: null }),
      getPublicUrl: (path) => ({ data: { publicUrl: `https://example.supabase.co/public/${path}` } })
    }) } }) }
  });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  const list = { querySelectorAll: () => [{ value: 'https://example.com/kept.jpg' }] };
  const run = (files) => {
    context.list = list;
    context.input = { files };
    return vm.runInContext('collectAttractionPhotos(list, input)', context);
  };
  assert.deepEqual(Array.from(await run([{ type: 'image/png', size: 10 }])),
    ['https://example.com/kept.jpg', 'https://example.supabase.co/public/new-id.png']);
  assert.deepEqual(uploads, ['attraction-photos/new-id.png']);
  await assert.rejects(run([{ type: 'image/gif', size: 10 }]), /JPEG, PNG or WebP/);
});

test('resort photos use signed storage URLs and report inaccessible photos', async () => {
  const errors = [];
  const context = vm.createContext({
    window: {}, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test',
    console: { error: (...args) => errors.push(args) },
    supabase: { createClient: () => ({ storage: { from: () => ({
      createSignedUrl: async (path) => path === 'owner/photo.jpg'
        ? { data: { signedUrl: 'https://example.supabase.co/signed/photo' }, error: null }
        : { data: null, error: new Error('Access denied') }
    }) } }) }
  });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  const html = await vm.runInContext("resortPhotoMarkup(['owner/photo.jpg', 'bad/photo.jpg'], 'Resort')", context);
  assert.match(html, /https:\/\/example\.supabase\.co\/signed\/photo/);
  assert.match(html, /Photo unavailable/);
  assert.doesNotMatch(html, /src="owner\/photo.jpg"/);
  assert.equal(errors.length, 1);
});

test('signing in or out of one portal does not replace another portal session', async () => {
  const storage = new Map();
  function openPage(path) {
    const html = readFileSync(new URL(path, import.meta.url), 'utf8');
    const portal = /<body\b[^>]*\bdata-auth-portal="([^"]+)"/.exec(html)?.[1];
    const context = vm.createContext({
      window: {},
      document: { body: { dataset: { authPortal: portal } } },
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test',
      supabase: {
        createClient: (_url, _key, options) => {
          const key = options?.auth?.storageKey || 'supabase-default';
          return {
            auth: {
              signInWithPassword: async ({ email }) => storage.set(key, email),
              signOut: async () => storage.delete(key),
              getSession: async () => ({ data: { session: storage.get(key) || null } })
            }
          };
        }
      }
    });
    vm.runInContext(readFileSync(statePath, 'utf8'), context);
    return vm.runInContext('supabaseClient.auth', context);
  }

  const admin = openPage('../../../apps/desktop/admin.html');
  const barangay = openPage('../../../apps/desktop/barangay-admin.html');
  const resort = openPage('../../../apps/desktop/resort-manager.html');
  const resortSignup = openPage('../../../apps/desktop/resort-signup.html');
  const guide = openPage('../../../apps/mobile/guide-login.html');
  const guideSignup = openPage('../../../apps/mobile/guide-signup.html');
  const guideDashboard = openPage('../../../apps/mobile/guide.html');
  const tourist = openPage('../../../apps/web/user.html');
  for (const [auth, email] of [[admin, 'admin'], [barangay, 'barangay'], [resort, 'resort'], [guide, 'guide']]) {
    await auth.signInWithPassword({ email });
  }
  for (const [auth, expected] of [[admin, 'admin'], [barangay, 'barangay'], [resortSignup, 'resort'], [guideSignup, 'guide'], [guideDashboard, 'guide'], [tourist, null]]) {
    assert.equal((await auth.getSession()).data.session, expected);
  }
  await guide.signOut();
  assert.equal((await admin.getSession()).data.session, 'admin');
  assert.equal((await guideDashboard.getSession()).data.session, null);
});

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

test('resort profile markup escapes text, allows only https links and hides past closed dates', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(statePath, 'utf8'), context);
  const html = vm.runInContext(`resortProfileMarkup({
    facilities: ['Pool', '<b>Wifi</b>'], opening_hours: '8am-5pm', contact: '0917',
    facebook_url: 'javascript:alert(1)', house_rules: 'No <script>', latitude: 14.7, longitude: 121.1,
    closed_dates: ['2000-01-01', '2999-12-25']
  })`, context);
  assert.match(html, /Pool/);
  assert.match(html, /&lt;b&gt;Wifi/);
  assert.match(html, /No &lt;script&gt;/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /google\.com\/maps\?q=14\.7,121\.1/);
  assert.match(html, /2999-12-25/);
  assert.doesNotMatch(html, /2000-01-01/);
  assert.equal(vm.runInContext('resortProfileMarkup({})', context), '');
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
    announcements: [{ id: 'event-1', title: 'Night market', ends_at: '2099-01-01T22:00:00Z' }],
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
  assert.deepEqual(state.announcements, rows.announcements);
  assert.ok(queriedTables.includes('announcements'));
  assert.ok(queriedTables.includes('public_resorts'));
});

test('loads public showcase places into the tourist portal state', async () => {
  const rows = {
    attractions: [],
    bookings: [],
    guides: [],
    shop_products: [],
    announcements: [],
    showcases: [{ id: 'showcase-1', name: 'Riverside lookout', description: 'A quiet view of the river.', latitude: 14.7, longitude: 121.1 }],
    public_resorts: [],
    barangays: []
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
  assert.deepEqual(state.showcases, rows.showcases);
  assert.ok(queriedTables.includes('showcases'));
});
