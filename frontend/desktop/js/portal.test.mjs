import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('municipal admins can return to the admin portal before and after signing in', async () => {
  const html = readFileSync(new URL('../../../apps/desktop/admin.html', import.meta.url), 'utf8');
  assert.match(html, /<main[^>]*>[\s\S]*?<a[^>]*href="admin-access\.html"[^>]*>Back to admin portal<\/a>/);

  const overlay = {
    style: {},
    querySelector(selector) {
      if (selector === 'form') return { addEventListener() {} };
      return {};
    }
  };
  const document = {
    body: { appendChild() {} },
    createElement: () => overlay,
    addEventListener() {}
  };
  const context = vm.createContext({
    document, window: {}, supabaseClient: {},
    getAuthSession: async () => null, getSessionRole: () => 'anon'
  });
  vm.runInContext(readFileSync(new URL('./portal.js', import.meta.url), 'utf8'), context);
  context.requireAdminSession();
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(overlay.innerHTML, /<a[^>]*href="admin-access\.html"[^>]*>Back to admin portal<\/a>/);
});

test('local admin menu opens only the selected management section', () => {
  const html = readFileSync(new URL('../../../apps/desktop/admin.html', import.meta.url), 'utf8');
  assert.match(html, /<details class="local-admin-menu">/);
  const panels = [{ id: 'local-areas', hidden: false }, { id: 'local-owners', hidden: true }];
  const tab = {
    dataset: { adminTab: 'local-admin', localAdminView: 'local-owners' },
    classList: { toggle() {} }, setAttribute() {},
    addEventListener(_, handler) { (this.handlers ||= []).push(handler); }
  };
  const document = {
    querySelectorAll(selector) {
      if (selector === '[data-admin-tab]' || selector === '[data-local-admin-view]') return [tab];
      if (selector === '[data-local-admin-panel]') return panels;
      return [];
    },
    addEventListener() {}
  };
  const context = vm.createContext({ document, window: {} });
  vm.runInContext(readFileSync(new URL('./portal.js', import.meta.url), 'utf8'), context);
  context.setupAdminControls();
  tab.handlers.forEach((handler) => handler());
  assert.deepEqual(panels.map((panel) => panel.hidden), [true, false]);
});

test('Municipal Admin exposes a working Add/Edit attraction panel tab', () => {
  const html = readFileSync(new URL('../../../apps/desktop/admin.html', import.meta.url), 'utf8');
  assert.match(html, /data-attraction-view="attraction-add-panel"/);
  for (const [tabId, panelId] of [
    ['attraction-list-tab', 'attraction-list-panel'],
    ['attraction-add-tab', 'attraction-add-panel']
  ]) {
    assert.match(html, new RegExp(`id="${tabId}"[^>]*aria-controls="${panelId}"`));
    assert.match(html, new RegExp(`id="${panelId}"[^>]*role="tabpanel"[^>]*aria-labelledby="${tabId}"`));
  }

  const tabs = [];
  const panels = [
    { id: 'attraction-list-panel', hidden: false },
    { id: 'attraction-add-panel', hidden: true }
  ];
  const tab = {
    dataset: { attractionView: 'attraction-add-panel' },
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener(_, handler) { this.click = handler; }
  };
  const document = {
    querySelectorAll(selector) {
      if (selector === '[data-attraction-view]') return [tab];
      if (selector === '.attraction-view-panel') return panels;
      return [];
    },
    addEventListener() {}
  };
  const context = vm.createContext({ document, window: { AdminShopFeature: { setup() {} } } });
  vm.runInContext(readFileSync(new URL('./portal.js', import.meta.url), 'utf8'), context);
  context.setupAdminControls();
  tab.click();

  assert.deepEqual(panels.map((panel) => panel.hidden), [true, false]);
});

test('guide removal failure is shown and the dashboard is reloaded', async () => {
  let remove;
  let warning;
  let refreshed = false;
  const controls = {
    '[data-guide-details]': { hidden: true },
    '[data-toggle-guide-details]': { addEventListener() {} },
    '[data-remove-guide]': { addEventListener: (_, fn) => { remove = fn; } }
  };
  const list = { innerHTML: '', appendChild() {} };
  const document = {
    getElementById: (id) => id === 'admin-guides-list' ? list : null,
    createElement: () => ({ innerHTML: '', querySelector: (selector) => controls[selector] }),
    addEventListener() {}
  };
  const window = {
    confirm: () => true, alert: (text) => { warning = text; },
    lastSyncErrors: { guides: new Error('A guide with a confirmed or ongoing tour cannot be removed.') }
  };
  const context = vm.createContext({
    window, document,
    updateState: async () => {},
    loadStateFromSupabase: async () => ({ guides: [] }),
    appState: {}, console
  });
  vm.runInContext(readFileSync(new URL('./portal.js', import.meta.url), 'utf8'), context);
  context.renderApp = async () => { refreshed = true; };
  context.renderAdminPage({
    guides: [{ id: 'g1', name: 'Guide', status: 'Approved' }],
    bookings: [], attractions: [], shopProducts: []
  });
  await remove();
  assert.match(warning, /confirmed or ongoing tour/);
  assert.equal(refreshed, true);
});

test('view attractions opens the municipal list without an empty pin picker', () => {
  const handlers = [];
  const overviewButton = {
    dataset: { adminTab: 'attractions' },
    addEventListener: (_, fn) => handlers.push(fn),
    classList: { toggle() {} }, setAttribute() {}
  };
  const panel = { id: 'attractions', hidden: true };
  let modalOpened = false;
  const document = {
    querySelectorAll: (selector) => {
      if (selector === '[data-admin-tab]' || selector === '#overview [data-admin-tab="attractions"]') return [overviewButton];
      if (selector === '.admin-tab-panel') return [panel];
      return [];
    },
    querySelector: () => null,
    getElementById: (id) => id === 'pin-picker-modal' ? { removeAttribute: () => { modalOpened = true; } } : null,
    addEventListener() {}
  };
  const window = { setTimeout: () => {} };
  const context = vm.createContext({ window, document });
  vm.runInContext(readFileSync(new URL('./portal.js', import.meta.url), 'utf8'), context);
  context.setupAdminControls();
  handlers.forEach((handler) => handler());
  assert.equal(panel.hidden, false);
  assert.equal(modalOpened, false);
});
