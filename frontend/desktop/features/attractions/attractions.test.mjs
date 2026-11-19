import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function setup({ confirmed = true, result = { data: { id: 'a1' }, error: null } } = {}) {
  const buttons = {};
  const card = {
    innerHTML: '',
    querySelector(selector) {
      if (!this.innerHTML.includes(selector.slice(1, -1))) return null;
      return buttons[selector] ||= {
        addEventListener(_event, handler) { this.click = handler; }
      };
    }
  };
  const list = { innerHTML: '', appendChild() {} };
  const deleted = [];
  const alerts = [];
  const state = { attractions: [{ id: 'a1', name: 'Falls', category: '', description: '', fee: '', duration: '' }] };
  const window = { confirm: () => confirmed, alert: (message) => alerts.push(message) };
  const context = vm.createContext({
    window, appState: state, USE_SUPABASE: true,
    document: {
      getElementById: () => list,
      createElement: () => card
    },
    escapeHtml: String,
    supabaseClient: {
      from(table) {
        return { delete: () => ({
          eq(_column, id) { deleted.push({ table, id }); return this; },
          select() { return this; },
          async maybeSingle() { return result; }
        }) };
      }
    },
    writeLocalAttractions: () => {},
    renderApp: async () => {}
  });
  vm.runInContext(readFileSync(new URL('./attractions.js', import.meta.url), 'utf8'), context);
  window.AdminAttractionsFeature.renderList(state);
  return { buttons, deleted, alerts, context, card };
}

test('municipal admin deletes only the selected attraction after confirmation', async () => {
  const harness = setup();
  assert.match(harness.card.innerHTML, /data-delete-attraction/);
  await harness.buttons['[data-delete-attraction]'].click();
  assert.deepEqual(harness.deleted, [{ table: 'attractions', id: 'a1' }]);
  assert.equal(harness.context.appState.attractions.length, 0);
});

test('cancelled or rejected deletion keeps the attraction visible', async () => {
  for (const options of [{ confirmed: false }, { result: { data: null, error: new Error('Permission denied') } }, { result: { data: null, error: null } }]) {
    const harness = setup(options);
    await harness.buttons['[data-delete-attraction]'].click();
    assert.equal(harness.context.appState.attractions.length, 1);
    if (options.confirmed === false) assert.equal(harness.deleted.length, 0);
    else assert.equal(harness.alerts.length, 1);
  }
});
