import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('barangay overview counts only bookings in assigned areas', async () => {
  let start;
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
      addEventListener() {}, querySelectorAll: () => [], reset() {}
    });
    return elements.get(id);
  };
  const data = {
    barangay_admin_assignments: [{ barangay_id: 'area' }],
    barangays: [{ id: 'area', name: 'Area' }],
    bookings: [
      { id: '1', barangay_id: 'area', status: 'Pending' },
      { id: '2', barangay_id: 'area', status: 'Approved' },
      { id: '3', barangay_id: 'other', status: 'Pending' }
    ],
    attractions: [{ id: 'a', barangay_id: 'area', name: 'Falls' }],
    guides: [], resort_submissions: [], attraction_submissions: [], shop_submissions: []
  };
  const context = vm.createContext({
    document: { getElementById, querySelectorAll: () => [], addEventListener: (_, fn) => { start = fn; } },
    window: {}, escapeHtml: String,
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient: {
      from(table) {
        return {
          select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
          then(resolve) { resolve({ data: data[table], error: null }); }
        };
      }
    }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  assert.equal(getElementById('barangay-stat-bookings').textContent, '2');
  assert.equal(getElementById('barangay-stat-pending').textContent, '1');
  assert.equal(getElementById('barangay-stat-attractions').textContent, '1');
});

test('editing a barangay attraction opens its populated form', async () => {
  let start;
  let edit;
  const tabs = ['attractions', 'add-attraction'].map((name) => ({
    dataset: { barangayTab: name }, classList: { toggle() {} },
    setAttribute() {}, addEventListener(_, fn) { this.click = fn; }
  }));
  const panels = ['attractions', 'add-attraction'].map((name) => ({
    dataset: { barangayTabPanel: name }, hidden: name !== 'attractions'
  }));
  const elements = new Map();
  const editButton = { dataset: { editAttraction: 'one' }, addEventListener(_, fn) { edit = fn; } };
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
      addEventListener() {}, scrollIntoView() {}, reset() {},
      querySelectorAll: (selector) => id === 'local-attractions' && selector === '[data-edit-attraction]' ? [editButton] : []
    });
    return elements.get(id);
  };
  const data = {
    barangay_admin_assignments: [{ barangay_id: 'area' }], barangays: [{ id: 'area', name: 'Area' }],
    bookings: [], guides: [], resort_submissions: [], attraction_submissions: [], shop_submissions: [],
    attractions: [{ id: 'one', barangay_id: 'area', name: 'Falls', coords: [14.73, 121.15] }]
  };
  const document = {
    body: { classList: { contains: (name) => name === 'barangay-admin-portal', toggle() {} } },
    getElementById,
    querySelector(selector) {
      if (selector === '.topbar > .nav-links') return {};
      if (selector === '[data-barangay-tab="add-attraction"]') return tabs[1];
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-barangay-tab]') return tabs;
      if (selector === '[data-barangay-tab-panel]') return panels;
      return [];
    },
    addEventListener(_, handler) { start = handler; }
  };
  const context = vm.createContext({
    document, window: { AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] } },
    escapeHtml: String, renderAttractionPhotoList() {},
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient: {
      from(table) {
        return {
          select() { return this; }, eq() { return this; }, in() { return this; }, order() { return this; },
          then(resolve) { resolve({ data: data[table], error: null }); }
        };
      }
    }
  });
  vm.runInContext(readFileSync(new URL('../../shared/js/navigation.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  edit();
  assert.equal(getElementById('local-attraction-name').value, 'Falls');
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
});

test('Barangay admin shows its logos, header links and sidebar with sign out', () => {
  const html = readFileSync(new URL('../../../apps/desktop/barangay-admin.html', import.meta.url), 'utf8');
  assert.match(html, /<a class="brand"[^>]*>[\s\S]*?tourism-logo\.png[\s\S]*?montalban-logo\.png[\s\S]*?Montalban Navigator[\s\S]*?<\/a>/);
  assert.match(html, /<nav class="nav-links"[^>]*>[\s\S]*?Admin portal[\s\S]*?Home[\s\S]*?<\/nav>/);
  for (const [section, label] of [
    ['overview', 'Overview'], ['add-attraction', 'Add attraction'], ['add-product', 'Add product'],
    ['attractions', 'Attractions'], ['bookings', 'Bookings'], ['resorts', 'Resorts']
  ]) {
    assert.match(html, new RegExp(`data-barangay-tab="${section}">${label}</button>`));
    assert.match(html, new RegExp(`data-barangay-tab-panel="${section}"`));
  }
  assert.match(html, /<aside id="barangay-sidebar"[\s\S]*?<\/nav>\s*<button id="barangay-signout"[^>]*>Sign out<\/button>\s*<\/aside>/);
  assert.match(html, /id="local-shop-image"[^>]*type="file"/);
  assert.match(html, /id="barangay-booking-export"[\s\S]*?data-export-month[\s\S]*?data-export-csv[\s\S]*?data-export-print/);
  assert.match(html, /frontend\/shared\/js\/booking-export\.js/);
  assert.match(html, /id="barangay-otp-group"[^>]*hidden[\s\S]*?id="barangay-code"[^>]*inputmode="numeric"[^>]*maxlength="6"/);
  assert.match(html, /frontend\/shared\/js\/email-otp-login\.js/);
  assert.doesNotMatch(html, /id="barangay-password"/);
});

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

test('a failed Barangay product submission cleans up its uploaded picture', async () => {
  let start;
  let submitShop;
  let inserted;
  let uploadedFile;
  const removed = [];
  const photoFile = { name: 'product.png', type: 'image/png', size: 20 };
  const elements = new Map();
  const getElementById = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        hidden: true, textContent: '', innerHTML: '', value: '', files: [], dataset: {},
        addEventListener(event, handler) {
          if (id === 'local-shop-form' && event === 'submit') submitShop = handler;
        },
        querySelectorAll: () => [], reset() {}
      });
    }
    return elements.get(id);
  };
  getElementById('shop-area').value = 'area';
  getElementById('local-shop-name').value = 'Local snack';
  getElementById('local-shop-price').value = '₱25';
  getElementById('local-shop-description').value = 'Freshly made';
  getElementById('local-shop-availability').value = 'At the market';
  getElementById('local-shop-image').files = [photoFile];
  const supabaseClient = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        then(resolve) { resolve({ data: [], error: null }); },
        insert(payload) { inserted = payload; return Promise.resolve({ error: new Error('Database unavailable') }); }
      };
    }
  };
  const context = vm.createContext({
    document: { getElementById, addEventListener: (_, handler) => { start = handler; } },
    getAuthSession: async () => ({ user: { id: 'admin', app_metadata: { role: 'barangay_admin' } } }),
    supabaseClient,
    uploadShopProductPhoto: async (file) => {
      uploadedFile = file;
      return { path: 'photo.png', url: 'https://example.test/photo.png' };
    },
    removeShopProductPhoto: async (path) => { removed.push(path); },
    escapeHtml: String,
    window: { AdminTransportFeature: { addRow() {}, loadOptions() {}, readOptions: () => [] } }
  });
  vm.runInContext(readFileSync(new URL('./barangay-admin.js', import.meta.url), 'utf8'), context);
  await start();
  await submitShop({ preventDefault() {} });

  assert.equal(uploadedFile, photoFile);
  assert.equal(inserted.payload.image, 'https://example.test/photo.png');
  assert.deepEqual(removed, ['photo.png']);
  assert.match(getElementById('local-shop-message').textContent, /Database unavailable/);
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
