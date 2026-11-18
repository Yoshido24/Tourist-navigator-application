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
    bookings: [{ id: 'booking-1', status: 'Approved' }],
    attractions: [],
    guides: [{ id: 'guide-1', name: 'Guide' }],
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
