import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('resort owner can switch between listing and bookings', () => {
  const html = readFileSync(new URL('../../../apps/desktop/resort-manager.html', import.meta.url), 'utf8');
  const tabs = [...html.matchAll(/<button\b[^>]*data-resort-tab="([^"]+)"[^>]*>/g)].map((match) => ({
    dataset: { resortTab: match[1] },
    attributes: {},
    classList: { toggle() {} },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(event, handler) { this[event] = handler; }
  }));
  const panels = [...html.matchAll(/<[^>]*id="(resort-(?:overview|listing|bookings|account|settings)-panel)"[^>]*>/g)]
    .map((match) => ({ id: match[1], hidden: false }));
  let start;
  const context = vm.createContext({
    document: {
      getElementById: () => null,
      querySelectorAll: (selector) => selector === '[data-resort-tab]' ? tabs : selector === '[data-resort-panel]' ? panels : [],
      addEventListener: (_event, handler) => { start = handler; }
    },
    supabaseClient: {},
    window: {}
  });
  vm.runInContext(readFileSync(new URL('./resort-manager.js', import.meta.url), 'utf8'), context);
  start();
  assert.equal(tabs.length, 5);
  assert.equal(panels.length, 5);
  tabs.find((tab) => tab.dataset.resortTab === 'resort-bookings-panel').click();
  assert.equal(panels.find((panel) => panel.id === 'resort-listing-panel').hidden, true);
  assert.equal(panels.find((panel) => panel.id === 'resort-bookings-panel').hidden, false);
  assert.equal(tabs.find((tab) => tab.dataset.resortTab === 'resort-bookings-panel').attributes['aria-selected'], 'true');
  tabs.find((tab) => tab.dataset.resortTab === 'resort-listing-panel').click();
  assert.equal(panels.find((panel) => panel.id === 'resort-listing-panel').hidden, false);
  assert.equal(panels.find((panel) => panel.id === 'resort-bookings-panel').hidden, true);
});

test('shows a dashboard loading error after restoring a signed-in session', async () => {
  const element = () => ({
    hidden: true,
    textContent: '',
    classList: { toggle() {} },
    addEventListener() {}
  });
  const elements = Object.fromEntries([
    'resort-signin', 'resort-auth-panel', 'resort-dashboard', 'resort-signout',
    'owner-login-error', 'owner-account-status'
  ].map((id) => [id, element()]));
  let start;
  const context = vm.createContext({
    window: {},
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') start = handler; }
    },
    supabaseClient: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: new Error('Connection failed') }) }) }) })
    }
  });
  vm.runInContext(readFileSync(new URL('./resort-manager.js', import.meta.url), 'utf8'), context);
  start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements['resort-dashboard'].hidden, false);
  assert.equal(elements['owner-account-status'].hidden, false);
  assert.equal(elements['owner-account-status'].textContent, 'Connection failed');
});

test('resort owners can edit services while their listing awaits review', async () => {
    function element() {
      return {
        hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
        classList: { toggle() {} },
        addEventListener(event, handler) { this[event] = handler; },
        replaceChildren() { this.children = []; },
        appendChild(child) { (this.children ||= []).push(child); }
      };
    }
    const ids = [
      'resort-signin', 'resort-auth-panel', 'resort-dashboard', 'resort-signout', 'owner-login-error',
      'owner-account-status', 'owner-dashboard-title', 'owner-listing', 'owner-listing-photos', 'owner-edit-listing',
      'owner-listing-form', 'owner-cancel-edit', 'owner-listing-name', 'owner-listing-barangay',
      'owner-listing-address', 'owner-listing-description', 'owner-listing-images', 'owner-existing-photos', 'owner-service-rows',
      'owner-listing-error', 'owner-bookings'
    ];
    const elements = Object.fromEntries(ids.map((id) => [id, element()]));
    let start;
    const inserts = [];
    const updates = [];
    const uploads = [];
    const removedUploads = [];
    let uploadError = null;
    let failedName = null;
    let signedIn = true;
    let nextId = 0;
    const submissions = [];
    let rows = [];
    let serviceName = 'Day pass';
    const service = {
      dataset: { serviceId: '' },
      querySelector(selector) {
        return { value: {
          '[data-service-name]': serviceName,
          '[data-service-fee]': '250',
          '[data-service-type]': 'day_visit',
          '[data-service-unit]': 'person'
        }[selector] };
      }
    };
    const supabaseClient = {
      auth: {
        getSession: async () => ({ data: { session: signedIn ? { user: { id: 'owner' } } : null }, error: null }),
        signOut: async () => { signedIn = false; return { error: null }; }
      },
      storage: { from: () => ({
        upload: async (path, file) => {
          if (uploadError && (!failedName || file.name === failedName)) return { error: uploadError };
          uploads.push({ path, file });
          return { error: null };
        },
        remove: async (paths) => { removedUploads.push(...paths); return { error: null }; }
      }) },
      from(table) {
        if (table === 'resort_managers') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Owner', contact: '123' }, error: null }) }) }) };
        if (table === 'barangays') return { select: () => ({ order: async () => ({ data: [{ id: 'b1', name: 'Barangay' }], error: null }) }) };
        if (table === 'resort_manager_applications') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { resort: { name: 'Sunset', barangayId: 'b1', address: 'Street', description: 'Pool', contact: '123', images: [] } }, error: null }) }) }) };
        if (table === 'resort_submissions') return {
          select: () => ({ eq: () => ({ order: async () => ({ data: submissions, error: null }) }) }),
          insert: async (value) => { inserts.push(value); submissions.push({ ...value, id: 'submission-1' }); return { error: null }; },
          update: (value) => ({
            eq: (_field, id) => ({
              eq: (_statusField, status) => ({
                select: () => ({
                  maybeSingle: async () => {
                    updates.push(value);
                    Object.assign(submissions.find((submission) => submission.id === id && submission.status === status), value);
                    return { data: { id }, error: null };
                  }
                })
              })
            })
          })
        };
        if (table === 'bookings') return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
        throw new Error(`Unexpected table: ${table}`);
      }
    };
    const sidebar = [];
    const context = vm.createContext({
      window: { setDashboardNavigation: (visible) => sidebar.push(visible) },
      document: {
        getElementById: (id) => elements[id] || null,
        querySelectorAll: (selector) => selector === '#owner-service-rows [data-service-row]' ? rows : [],
        createElement: () => ({
          dataset: {},
          querySelector: () => ({ value: '', addEventListener() {} })
        }),
        addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') start = handler; }
      },
      supabaseClient,
      escapeHtml: String,
      resortPhotoMarkup: async (images) => images.join(','),
      crypto: { randomUUID: () => `new-id-${++nextId}` }
    });

    vm.runInContext(readFileSync(new URL('./resort-manager.js', import.meta.url), 'utf8'), context);
    start();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(sidebar, [true]);
    assert.equal(elements['owner-edit-listing'].hidden, false);
    elements['owner-edit-listing'].click();
    assert.equal(elements['owner-listing-form'].hidden, false);
    assert.equal(elements['owner-listing-name'].value, 'Sunset');
    await elements['owner-listing-form'].submit({ preventDefault() {} });
    assert.equal(inserts.length, 0);
    assert.match(elements['owner-listing-error'].textContent, /at least one service/i);
    rows = [service];
    elements['owner-listing-images'].files = Array.from({ length: 6 }, () => ({ type: 'image/jpeg', size: 1024 }));
    await elements['owner-listing-form'].submit({ preventDefault() {} });
    assert.equal(inserts.length, 0);
    assert.match(elements['owner-listing-error'].textContent, /no more than 5/i);
    elements['owner-listing-images'].files = [{ name: 'resort.svg', type: 'image/svg+xml', size: 1024 }];
    await elements['owner-listing-form'].submit({ preventDefault() {} });
    assert.equal(inserts.length, 0);
    assert.match(elements['owner-listing-error'].textContent, /JPEG, PNG or WebP/);
    elements['owner-listing-images'].files = [
      { name: 'first.jpg', type: 'image/jpeg', size: 1024 },
      { name: 'second.jpg', type: 'image/jpeg', size: 1024 }
    ];
    uploadError = new Error('Storage unavailable');
    failedName = 'second.jpg';
    await elements['owner-listing-form'].submit({ preventDefault() {} });
    assert.equal(inserts.length, 0);
    assert.match(elements['owner-listing-error'].textContent, /Storage unavailable/);
    assert.ok(removedUploads.includes(uploads[0].path));
    uploads.length = 0;
    uploadError = null;
    elements['owner-listing-images'].files = [{ name: 'resort.jpg', type: 'image/jpeg', size: 1024 }];
    await elements['owner-listing-form'].submit({ preventDefault() {} });
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].resort_id, null);
    assert.equal(inserts[0].status, 'Pending');
    assert.equal(inserts[0].services[0].name, 'Day pass');
    assert.equal(inserts[0].services[0].fee, 250);
    assert.equal(uploads.length, 1);
    assert.equal(inserts[0].images[0], uploads[0].path);
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(elements['owner-listing-photos'].innerHTML, /owner\/new-id-\d+\.jpg/);
    assert.equal(elements['owner-listing-form'].hidden, true);
    assert.equal(elements['owner-edit-listing'].hidden, false);
    assert.match(elements['owner-listing'].innerHTML, /waiting for Barangay Admin review/i);
    elements['owner-edit-listing'].click();
    assert.equal(elements['owner-listing-form'].hidden, false);
    serviceName = 'Updated day pass';
    await elements['owner-listing-form'].submit({ preventDefault() {} });
    assert.equal(inserts.length, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].services[0].name, 'Updated day pass');
    await elements['resort-signout'].click();
    assert.equal(elements['owner-listing-photos'].innerHTML, '');
});

test('owner must pick a reason to decline, and sees the estimated total and pending count', async () => {
  const element = () => ({
    hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
    classList: { toggle() {} }, addEventListener() {}, appendChild() {}, replaceChildren() {}
  });
  const elements = Object.fromEntries([
    'resort-signin', 'resort-auth-panel', 'resort-dashboard', 'resort-signout', 'owner-login-error',
    'owner-account-status', 'owner-dashboard-title', 'owner-listing', 'owner-listing-photos', 'owner-edit-listing',
    'owner-listing-form', 'owner-listing-barangay', 'owner-bookings', 'resort-bookings-tab'
  ].map((id) => [id, element()]));
  const decline = { dataset: { ownerDecision: 'Rejected', bookingId: 'b1' }, addEventListener(_event, handler) { this.click = handler; } };
  const reason = { value: '' };
  const warning = { hidden: true, textContent: '' };
  const updates = [];
  elements['owner-bookings'].querySelectorAll = (selector) => selector === '[data-owner-decision]' ? [decline] : [];
  elements['owner-bookings'].querySelector = (selector) => selector.includes('decline-reason') ? reason : warning;
  const booking = { id: 'b1', status: 'Pending', adults: 2, kids: 1, service_fee: 100, service_pricing_unit: 'person' };
  let start;
  const context = vm.createContext({
    window: {}, CSS: { escape: String }, escapeHtml: String, resortPhotoMarkup: async () => '',
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') start = handler; }
    },
    supabaseClient: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      from(table) {
        if (table === 'resort_managers') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Owner' }, error: null }) }) }) };
        if (table === 'barangays') return { select: () => ({ order: async () => ({ data: [{ id: 'b1', name: 'Barangay' }], error: null }) }) };
        if (table === 'resort_manager_applications') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
        if (table === 'resort_submissions') return { select: () => ({ eq: () => ({ order: async () => ({ data: [{ status: 'Pending', name: 'R', services: [], images: [] }], error: null }) }) }) };
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [booking], error: null }) }) }),
          update: (value) => ({ eq: async () => { updates.push(value); return { error: null }; } })
        };
      }
    }
  });
  vm.runInContext(readFileSync(new URL('./resort-manager.js', import.meta.url), 'utf8'), context);
  start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements['resort-bookings-tab'].textContent, 'Bookings (1)');
  assert.match(elements['owner-bookings'].innerHTML, /Estimated total:<\/strong> ₱300/);
  await decline.click();
  assert.equal(updates.length, 0);
  assert.match(warning.textContent, /reason/i);
  reason.value = 'Fully booked';
  await decline.click();
  assert.equal(JSON.stringify(updates), JSON.stringify([{ status: 'Rejected', decline_reason: 'Fully booked' }]));
});

test('owner closes dates through the RPC and submits the profile with the chosen cover photo', async () => {
  const element = () => ({
    hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
    classList: { toggle() {} }, appendChild() {}, replaceChildren() {},
    addEventListener(event, handler) { this[event] = handler; },
    querySelectorAll() { return []; }
  });
  const elements = Object.fromEntries([
    'resort-signin', 'resort-auth-panel', 'resort-dashboard', 'resort-signout', 'owner-login-error',
    'owner-account-status', 'owner-dashboard-title', 'owner-listing', 'owner-listing-photos', 'owner-edit-listing',
    'owner-listing-form', 'owner-listing-barangay', 'owner-listing-name', 'owner-listing-address', 'owner-listing-description',
    'owner-listing-images', 'owner-existing-photos', 'owner-service-rows', 'owner-listing-error', 'owner-bookings',
    'owner-closed-card', 'owner-closed-list', 'owner-closed-date', 'owner-add-closed', 'owner-closed-error',
    'owner-listing-contact', 'owner-listing-hours', 'owner-listing-facebook', 'owner-listing-rules',
    'owner-listing-lat', 'owner-listing-lng'
  ].map((id) => [id, element()]));
  const approved = { status: 'Approved', resort_id: 'r1', owner_id: 'owner', name: 'R', barangay_id: 'b1', images: ['a.jpg', 'b.jpg', 'c.jpg'], services: [{ name: 'S', fee: 1, pricingUnit: 'person' }], facilities: ['Pool'] };
  const rpcs = [];
  const inserts = [];
  const service = { dataset: { serviceId: '' }, querySelector: (s) => ({ value: { '[data-service-name]': 'S', '[data-service-fee]': '1', '[data-service-type]': 'day_visit', '[data-service-unit]': 'person' }[s] }) };
  const checked = {
    '[data-remove-resort-photo]:checked': [],
    '[data-facility]:checked': [{ value: 'Pool' }, { value: 'Wi-Fi' }],
    '#owner-service-rows [data-service-row]': [service]
  };
  let start;
  const context = vm.createContext({
    window: {}, CSS: { escape: String }, escapeHtml: String, resortPhotoMarkup: async () => '', resortProfileMarkup: () => '',
    crypto: { randomUUID: () => 'new-id' },
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: (selector) => selector === '[data-cover-resort-photo]:checked' ? [{ value: '2' }] : checked[selector] || [],
      createElement: () => ({ dataset: {}, querySelector: () => ({ value: '', addEventListener() {} }) }),
      addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') start = handler; }
    },
    supabaseClient: {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      rpc: async (name, args) => { rpcs.push({ name, args: JSON.parse(JSON.stringify(args)) }); return { error: null }; },
      from(table) {
        if (table === 'resort_managers') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Owner' }, error: null }) }) }) };
        if (table === 'barangays') return { select: () => ({ order: async () => ({ data: [{ id: 'b1', name: 'B' }], error: null }) }) };
        if (table === 'public_resorts') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { closed_dates: ['2026-12-25'] }, error: null }) }) }) };
        if (table === 'resort_submissions') return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [approved], error: null }) }) }),
          insert: async (value) => { inserts.push(value); return { error: null }; }
        };
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
      }
    }
  });
  vm.runInContext(readFileSync(new URL('./resort-manager.js', import.meta.url), 'utf8'), context);
  start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements['owner-closed-card'].hidden, false);
  assert.match(elements['owner-closed-list'].innerHTML, /2026-12-25/);
  elements['owner-closed-date'].value = '2026-12-24';
  await elements['owner-add-closed'].click();
  assert.equal(JSON.stringify(rpcs), JSON.stringify([{ name: 'set_resort_closed_dates', args: { target: 'r1', dates: ['2026-12-24', '2026-12-25'] } }]));
  elements['owner-edit-listing'].click();
  elements['owner-listing-hours'].value = '8am-5pm';
  elements['owner-listing-lat'].value = '14.7';
  elements['owner-listing-lng'].value = '121.1';
  elements['owner-listing-facebook'].value = 'http://insecure.example';
  await elements['owner-listing-form'].submit({ preventDefault() {} });
  assert.equal(inserts.length, 0);
  assert.match(elements['owner-listing-error'].textContent, /https/);
  elements['owner-listing-facebook'].value = 'https://facebook.com/r';
  await elements['owner-listing-form'].submit({ preventDefault() {} });
  assert.equal(inserts.length, 1);
  assert.equal(JSON.stringify(inserts[0].images), JSON.stringify(['c.jpg', 'a.jpg', 'b.jpg']));
  assert.equal(JSON.stringify(inserts[0].facilities), JSON.stringify(['Pool', 'Wi-Fi']));
  assert.equal(inserts[0].opening_hours, '8am-5pm');
  assert.equal(inserts[0].latitude, 14.7);
});

test('owner registration submits without service fields', async () => {
  const values = {
    'owner-signup-email': 'owner@example.com', 'owner-signup-password': 'password123',
    'owner-name': 'Owner', 'owner-contact': '123', 'signup-resort-name': 'Sunset',
    'signup-barangay': 'b1', 'signup-resort-address': 'Street', 'signup-resort-description': 'Pool'
  };
  const elements = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  for (const id of ['resort-signup', 'owner-signup-error', 'owner-signup-message', 'owner-terms']) {
    elements[id] = { hidden: true, checked: true, classList: { toggle() {} }, addEventListener(event, handler) { this[event] = handler; }, reset() {} };
  }
  let start;
  let body;
  const context = vm.createContext({
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') start = handler; }
    },
    supabaseClient: {
      from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 'b1', name: 'Barangay' }], error: null }) }) }),
      functions: { invoke: async (name, request) => { body = request.body; return { data: { ok: true }, error: null }; } }
    },
    escapeHtml: String
  });
  vm.runInContext(readFileSync(new URL('./resort-manager.js', import.meta.url), 'utf8'), context);
  start();
  await elements['resort-signup'].submit({ preventDefault() {} });
  assert.equal(body.action, 'register-resort-manager');
  assert.equal(body.resort.name, 'Sunset');
  assert.equal('services' in body.resort, false);
  assert.equal(elements['owner-signup-error'].hidden, true);
  assert.equal(elements['owner-signup-message'].hidden, false);
});

test('owner registration displays the server reason when the function rejects an application', async () => {
  const values = {
    'owner-signup-email': 'owner@example.com', 'owner-signup-password': 'password123',
    'owner-name': 'Owner', 'owner-contact': '123', 'signup-resort-name': 'Sunset',
    'signup-barangay': 'b1', 'signup-resort-address': '', 'signup-resort-description': ''
  };
  const elements = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  for (const id of ['resort-signup', 'owner-signup-error', 'owner-signup-message', 'owner-terms']) {
    elements[id] = { hidden: true, checked: true, classList: { toggle() {} }, addEventListener(event, handler) { this[event] = handler; } };
  }
  let start;
  const getFunctionErrorMessage = vm.runInNewContext(
    `${readFileSync(new URL('../../shared/js/state.js', import.meta.url), 'utf8')}\ngetFunctionErrorMessage`,
    { console }
  );
  const context = vm.createContext({
    document: {
      getElementById: (id) => elements[id] || null,
      querySelectorAll: () => [],
      addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') start = handler; }
    },
    supabaseClient: {
      from: () => ({ select: () => ({ order: async () => ({ data: [{ id: 'b1', name: 'Barangay' }], error: null }) }) }),
      functions: { invoke: async () => ({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: new Response(JSON.stringify({ ok: false, error: 'Please choose a valid barangay.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
          })
        }
      }) }
    },
    escapeHtml: String, getFunctionErrorMessage
  });
  vm.runInContext(readFileSync(new URL('./resort-manager.js', import.meta.url), 'utf8'), context);
  start();
  await elements['resort-signup'].submit({ preventDefault() {} });
  assert.equal(elements['owner-signup-error'].textContent, 'Please choose a valid barangay.');
  assert.equal(elements['owner-signup-error'].hidden, false);
});
