import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('a different signed-in role sees the login screen without sign out or a sidebar', async () => {
  let start;
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', value: '', dataset: {}, addEventListener() {}, querySelectorAll: () => [] });
    return elements.get(id);
  };
  const sidebar = [];
  const context = vm.createContext({
    document: { getElementById, addEventListener: (_, handler) => { start = handler; } },
    getAuthSession: async () => ({ user: { id: 'other', app_metadata: { role: 'admin' } } }),
    supabaseClient: {},
    window: { setDashboardNavigation: (visible) => sidebar.push(visible) }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  assert.equal(getElementById('barangay-signin-panel').hidden, false);
  assert.equal(getElementById('barangay-signout').hidden, true);
  assert.deepEqual(sidebar, [false]);
});

test('assigns an approved guide and changes the booking to Assigned', async () => {
  let start;
  let saveGuide;
  let update;
  const button = {
    dataset: { saveGuide: 'booking-1' },
    addEventListener: (_, listener) => { saveGuide = listener; }
  };
  const list = {
    innerHTML: '',
    querySelectorAll: (selector) => selector === '[data-save-guide]' ? [button] : [],
    querySelector: () => ({ value: 'guide-1' })
  };
  const elements = new Map();
  const getElementById = (id) => {
    if (id === 'barangay-bookings') return list;
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', innerHTML: '', value: '', dataset: {}, addEventListener() {}, querySelectorAll: () => [] });
    return elements.get(id);
  };
  const data = {
    barangay_admin_assignments: [{ barangay_id: 'area' }],
    barangays: [{ id: 'area', name: 'Area' }],
    bookings: [{ id: 'booking-1', status: 'Approved', barangay_id: 'area' }],
    attractions: [],
    guides: [{ id: 'guide-1', name: 'Guide', barangay_id: 'area' }],
    resort_submissions: [], attraction_submissions: [], shop_submissions: []
  };
  const supabaseClient = {
    rpc: async () => ({ data: data.guides, error: null }),
    from(table) {
      const query = {
        select() { return this; },
        eq() { return this; },
        in() { return this; },
        order() { return this; },
        update(value) { update = value; return this; },
        async maybeSingle() { return { data: { id: 'booking-1' }, error: null }; },
        then(resolve) { resolve({ data: data[table], error: null }); }
      };
      return query;
    }
  };
  const context = vm.createContext({
    document: { getElementById, addEventListener: (_, handler) => { start = handler; } },
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient,
    escapeHtml: (value) => String(value),
    CSS: { escape: (value) => value },
    window: { AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] } }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  await saveGuide();
  assert.equal(update.guide_id, 'guide-1');
  assert.equal(update.assignedGuide, 'Guide');
  assert.equal(update.status, 'Assigned');
});

test('guide choices exclude other barangays even when the admin covers both', async () => {
  let start;
  const list = { innerHTML: '', querySelectorAll: () => [] };
  const elements = new Map();
  const getElementById = (id) => {
    if (id === 'barangay-bookings') return list;
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', innerHTML: '', value: '', dataset: {}, addEventListener() {}, querySelectorAll: () => [] });
    return elements.get(id);
  };
  const data = {
    barangay_admin_assignments: [{ barangay_id: 'a' }, { barangay_id: 'b' }],
    barangays: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    bookings: [{ id: 'booking-1', status: 'Approved', barangay_id: 'a' }],
    attractions: [], resort_submissions: [], attraction_submissions: [], shop_submissions: [],
    guides: [{ id: 'local', name: 'Local guide', barangay_id: 'a' }, { id: 'other', name: 'Other guide', barangay_id: 'b' }]
  };
  const supabaseClient = {
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
        then(resolve) { resolve({ data: data[table], error: null }); }
      };
    },
    rpc: async () => ({ data: data.guides, error: null })
  };
  const context = vm.createContext({
    document: { getElementById, addEventListener: (_, handler) => { start = handler; } },
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient, escapeHtml: String,
    window: { AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] } }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  assert.match(list.innerHTML, /Local guide/);
  assert.doesNotMatch(list.innerHTML, /Other guide/);
});
