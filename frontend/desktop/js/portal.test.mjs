import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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
