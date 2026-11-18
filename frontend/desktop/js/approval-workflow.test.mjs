import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('barangay attraction submission stays pending and preserves its selected area', async () => {
  const handlers = {};
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
      addEventListener(type, fn) { handlers[`${id}:${type}`] = fn; },
      querySelectorAll() { return []; }, reset() {}
    });

    return elements.get(id);
  };
  Object.entries({
    'attraction-area': 'area', 'local-attraction-name': 'Falls',
    'local-attraction-category': 'Adventure', 'local-attraction-description': 'A waterfall',
    'local-attraction-trail': 'Easy trail', 'local-attraction-images': 'https://example.test/falls.jpg'
  }).forEach(([id, value]) => { element(id).value = value; });
  let inserted;
  let inserts = 0;
  let resolveInsert;
  const data = {
    barangay_admin_assignments: [{ barangay_id: 'area' }], barangays: [{ id: 'area', name: 'Area' }],
    bookings: [], attractions: [], guides: [], resort_submissions: [],
    attraction_submissions: [], shop_submissions: []
  };
  const supabaseClient = { rpc: async () => ({ data: data.guides, error: null }), from(table) {
    return {
      select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
      insert(value) { inserts += 1; inserted = { table, value }; return new Promise((resolve) => { resolveInsert = resolve; }); },
      then(resolve) { resolve({ data: data[table], error: null }); }
    };
  } };
  let start;
  let mapClick;
  const map = {
    setView() { return this; }, on(event, handler) { if (event === 'click') mapClick = handler; },
    invalidateSize() {}, removeLayer() {}
  };
  const context = vm.createContext({
    document: { getElementById: element, addEventListener: (_, fn) => { start = fn; } },
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient, escapeHtml: (v) => String(v), CSS: { escape: (v) => v },
    window: {
      AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] },
      ATTRACTION_CATEGORIES: ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls'],
      setTimeout: (callback) => callback(),
      L: {
        map: () => map, tileLayer: () => ({ addTo() {} }),
        marker: () => ({ addTo() { return this; }, bindTooltip() {} })
      }
    }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  await handlers['local-attraction-form:submit']({ preventDefault() {} });
  assert.equal(inserts, 0);
  assert.match(element('local-attraction-message').textContent, /valid attraction location/i);
  handlers['local-choose-location:click']();
  mapClick({ latlng: { lat: 14.73, lng: 121.15 } });
  handlers['local-confirm-location:click']();
  const first = handlers['local-attraction-form:submit']({ preventDefault() {} });
  const second = handlers['local-attraction-form:submit']({ preventDefault() {} });
  assert.equal(inserts, 1);
  resolveInsert({ error: null });
  await Promise.all([first, second]);
  assert.equal(inserted.table, 'attraction_submissions');
  assert.equal(inserted.value.barangay_id, 'area');
  assert.equal(inserted.value.payload.name, 'Falls');
  assert.equal(inserted.value.payload.category, 'Adventure');
  for (const value of ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls']) {
    assert.match(element('local-attraction-category').innerHTML, new RegExp(value));
  }
  assert.deepEqual(Array.from(inserted.value.payload.coords), [14.73, 121.15]);
  assert.equal(inserted.value.payload.trail, 'Easy trail');
  assert.deepEqual(Array.from(inserted.value.payload.images), ['https://example.test/falls.jpg']);
});

test('municipal approval sends the selected pending attraction to the review function', async () => {
  let review;
  const button = {
    dataset: { approvalId: 'proposal-1', approvalDecision: 'true' },
    addEventListener(_, fn) { review = fn; }
  };
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      dataset: {}, hidden: true, textContent: '', innerHTML: '',
      classList: { toggle() {} }, addEventListener() {},
      querySelectorAll: (selector) => id === 'municipal-attraction-proposals' && selector === '[data-approval-id]' ? [button] : []
    });
    return elements.get(id);
  };
  const rows = {
    barangays: [{ id: 'area', name: 'Area' }], resort_manager_applications: [], resort_submissions: [],
    attraction_submissions: [{ id: 'proposal-1', barangay_id: 'area', payload: { name: 'Falls', category: 'Nature', coords: [14.73, 121.15] } }],
    shop_submissions: [], attractions: []
  };
  let call;
  const supabaseClient = {
    from(table) { return {
      select() { return this; }, eq() { return this; }, order() { return this; },
      then(resolve) { resolve({ data: rows[table], error: null }); }
    }; },
    async rpc(name, args) { call = { name, args }; return { error: null }; }
  };
  const window = { confirm: () => true };
  let refreshed = false;
  const context = vm.createContext({
    document: { getElementById: element }, window, supabaseClient, escapeHtml: (v) => String(v),
    appState: {}, loadStateFromSupabase: async () => ({ attractions: [{ id: 'proposal-1' }] }),
    renderApp: async (state) => { refreshed = state.attractions[0].id === 'proposal-1'; }
  });
  vm.runInContext(readFileSync(new URL('../features/local-admin/local-admin.js', import.meta.url), 'utf8'), context);
  window.LocalAdminFeature.setup();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof review, 'function');
  await review();
  assert.equal(call.name, 'review_attraction_submission');
  assert.equal(call.args.submission_id, 'proposal-1');
  assert.equal(call.args.approved, true);
  assert.equal(refreshed, true);
});

test('shared attraction categories match the admin category choices', () => {
  const categories = vm.runInNewContext(
    `${readFileSync(new URL('../../shared/js/state.js', import.meta.url), 'utf8')}\nwindow.ATTRACTION_CATEGORIES`,
    { window: {}, console }
  );
  assert.deepEqual(Array.from(categories), ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls']);
});

test('barangay admin creation shows why the account could not be created', async () => {
  const handlers = {};
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      dataset: {}, hidden: true, textContent: '', innerHTML: '', value: '',
      classList: { toggle() {} },
      addEventListener(type, fn) { handlers[`${id}:${type}`] = fn; },
      querySelectorAll() { return []; }
    });
    return elements.get(id);
  };
  element('new-barangay-admin-areas').selectedOptions = [{ value: 'area' }];
  const client = {
    from() { return {
      select() { return this; }, eq() { return this; }, order() { return this; },
      then(resolve) { resolve({ data: [], error: null }); }
    }; },
    functions: { invoke: async () => ({
      data: null, error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ ok: false, error: 'A selected barangay already has a Barangay Admin.' }), {
          status: 409, headers: { 'Content-Type': 'application/json' }
        })
      }
    }) }
  };
  const getFunctionErrorMessage = vm.runInNewContext(
    `${readFileSync(new URL('../../shared/js/state.js', import.meta.url), 'utf8')}\ngetFunctionErrorMessage`,
    { window: {}, console }
  );
  const context = vm.createContext({ document: { getElementById: element }, window: {}, supabaseClient: client, escapeHtml: String, getFunctionErrorMessage });
  vm.runInContext(readFileSync(new URL('../features/local-admin/local-admin.js', import.meta.url), 'utf8'), context);
  context.window.LocalAdminFeature.setup();
  await handlers['create-barangay-admin-form:submit']({ preventDefault() {} });
  assert.equal(element('local-admin-message').textContent, 'A selected barangay already has a Barangay Admin.');
});
