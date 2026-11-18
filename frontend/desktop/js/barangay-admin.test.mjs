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

test('switches among the four Barangay Admin work tabs', async () => {
  let start;
  const targets = ['content', 'existing', 'bookings', 'resorts'];
  const tabs = targets.map((target, index) => ({
    dataset: { barangayTab: target },
    attributes: { 'aria-controls': `${target}-panel` },
    selected: index === 0 ? 'true' : 'false',
    classList: { toggle() {} },
    getAttribute(name) { return this.attributes[name]; },
    setAttribute(name, value) { if (name === 'aria-selected') this.selected = value; },
    addEventListener(event, handler) { this[event] = handler; }
  }));
  const panels = targets.map((target, index) => ({
    id: `${target}-panel`,
    hidden: index !== 0
  }));
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', value: '', dataset: {},
      addEventListener() {}, querySelectorAll: () => []
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    document: {
      getElementById,
      querySelectorAll(selector) {
        if (selector === '[data-barangay-tab]') return tabs;
        if (selector === '[data-barangay-panel]') return panels;
        return [];
      },
      addEventListener: (_, handler) => { start = handler; }
    },
    getAuthSession: async () => null,
    supabaseClient: {},
    escapeHtml: String,
    window: { AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] } }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  tabs[1].click();

  assert.deepEqual(panels.map((panel) => panel.hidden), [true, false, true, true]);
  assert.deepEqual(tabs.map((tab) => tab.selected), ['false', 'true', 'false', 'false']);
});

test('preserves an existing nonstandard attraction category when editing', async () => {
  let start;
  let edit;
  let openedAttractionForm = false;
  const editButton = {
    dataset: { editAttraction: 'attraction-1' },
    addEventListener(_, handler) { edit = handler; }
  };
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
      children: [],
      classList: { toggle() {} },
      addEventListener() {},
      appendChild(child) { this.children.push(child); },
      querySelectorAll: (selector) => id === 'local-attractions' && selector === '[data-edit-attraction]' ? [editButton] : [],
      reset() {},
      scrollIntoView() {}
    });
    return elements.get(id);
  };
  const data = {
    barangay_admin_assignments: [{ barangay_id: 'area' }],
    barangays: [{ id: 'area', name: 'Area' }],
    bookings: [],
    attractions: [{ id: 'attraction-1', barangay_id: 'area', name: 'Falls', category: 'Nature' }],
    resort_submissions: [], attraction_submissions: [], shop_submissions: []
  };
  const supabaseClient = {
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
        then(resolve) { resolve({ data: data[table], error: null }); }
      };
    }
  };
  const context = vm.createContext({
    document: {
      getElementById,
      querySelectorAll: () => [],
      querySelector: (selector) => selector === '[data-barangay-tab="barangay-add-attraction-panel"]'
        ? { click() { openedAttractionForm = true; } } : null,
      createElement: () => ({ value: '', textContent: '' }),
      addEventListener: (_, handler) => { start = handler; }
    },
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient,
    escapeHtml: String,
    window: {
      ATTRACTION_CATEGORIES: ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls'],
      AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] }
    }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  const category = getElementById('local-attraction-category');
  for (const value of ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls']) {
    assert.match(category.innerHTML, new RegExp(value));
  }
  await edit();

  assert.equal(category.value, 'Nature');
  assert.equal(category.children.some((option) => option.value === 'Nature'), true);
  assert.equal(openedAttractionForm, true);
});

test('barangay navigation starts at a dashboard with separate work panels', () => {
  const html = readFileSync(new URL('../../../apps/desktop/barangay-admin.html', import.meta.url), 'utf8');
  for (const id of ['dashboard', 'add-attraction', 'add-product', 'existing', 'bookings', 'resorts']) {
    assert.match(html, new RegExp(`data-barangay-tab="barangay-${id}-panel"`));
    assert.match(html, new RegExp(`id="barangay-${id}-panel"[^>]*data-barangay-panel`));
  }
  assert.match(html, /id="barangay-dashboard-panel"[^>]*data-barangay-panel(?![^>]*hidden)/);
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

test('explains guide assignment for pending bookings and when no approved guides exist', async () => {
  let start;
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, { hidden: true, textContent: '', innerHTML: '', value: '', dataset: {}, addEventListener() {}, querySelectorAll: () => [] });
    return elements.get(id);
  };
  const data = {
    barangay_admin_assignments: [{ barangay_id: 'area' }], barangays: [{ id: 'area', name: 'Area' }],
    bookings: [{ id: 'pending', status: 'Pending' }, { id: 'approved', status: 'Approved' }],
    attractions: [], resort_submissions: [], attraction_submissions: [], shop_submissions: []
  };
  const context = vm.createContext({
    document: { getElementById, addEventListener: (_, handler) => { start = handler; } },
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient: {
      rpc: async () => ({ data: [], error: null }),
      from(table) {
        return {
          select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
          then(resolve) { resolve({ data: data[table], error: null }); }
        };
      }
    },
    escapeHtml: String,
    window: { AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] } }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  const html = getElementById('barangay-bookings').innerHTML;
  assert.match(html, /approve.*before assigning a guide/i);
  assert.match(html, /no approved guides.*municipal admin/i);
});
