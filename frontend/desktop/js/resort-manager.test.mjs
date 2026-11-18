import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

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

test('approved owners add services before submitting their first listing', async () => {
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
      'owner-account-status', 'owner-dashboard-title', 'owner-listing', 'owner-edit-listing',
      'owner-listing-form', 'owner-cancel-edit', 'owner-listing-name', 'owner-listing-barangay',
      'owner-listing-address', 'owner-listing-description', 'owner-service-rows',
      'owner-listing-error', 'owner-bookings'
    ];
    const elements = Object.fromEntries(ids.map((id) => [id, element()]));
    let start;
    const inserts = [];
    const submissions = [];
    let rows = [];
    const service = {
      dataset: { serviceId: '' },
      querySelector(selector) {
        return { value: {
          '[data-service-name]': 'Day pass',
          '[data-service-fee]': '250',
          '[data-service-type]': 'day_visit',
          '[data-service-unit]': 'person'
        }[selector] };
      }
    };
    const supabaseClient = {
      auth: { getSession: async () => ({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      from(table) {
        if (table === 'resort_managers') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Owner', contact: '123' }, error: null }) }) }) };
        if (table === 'barangays') return { select: () => ({ order: async () => ({ data: [{ id: 'b1', name: 'Barangay' }], error: null }) }) };
        if (table === 'resort_manager_applications') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { resort: { name: 'Sunset', barangayId: 'b1', address: 'Street', description: 'Pool', contact: '123', images: [] } }, error: null }) }) }) };
        if (table === 'resort_submissions') return {
          select: () => ({ eq: () => ({ order: async () => ({ data: submissions, error: null }) }) }),
          insert: async (value) => { inserts.push(value); submissions.push(value); return { error: null }; }
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
      crypto: { randomUUID: () => 'new-id' }
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
    await elements['owner-listing-form'].submit({ preventDefault() {} });
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].resort_id, null);
    assert.equal(inserts[0].status, 'Pending');
    assert.equal(inserts[0].services[0].name, 'Day pass');
    assert.equal(inserts[0].services[0].fee, 250);
    assert.equal(elements['owner-listing-form'].hidden, true);
    assert.equal(elements['owner-edit-listing'].hidden, true);
    assert.match(elements['owner-listing'].innerHTML, /waiting for Barangay Admin review/i);
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
