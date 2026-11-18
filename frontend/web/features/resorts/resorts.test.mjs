import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('map selection opens the Resort tab with the chosen resort services', () => {
  let selectResort;
  const selectedTabs = [];
  const elements = new Map();
  const resortButton = {
    dataset: { selectResort: 'resort-1' },
    addEventListener(_, handler) { selectResort = handler; }
  };
  const list = {
    innerHTML: '',
    querySelectorAll(selector) { return selector === '[data-select-resort]' ? [resortButton] : []; }
  };
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: '', innerHTML: '', value: '', dataset: {},
      addEventListener() {}, scrollIntoView() {}, selectedOptions: [],
      replaceChildren(...children) { this.children = children; this.selectedOptions = children.slice(0, 1); }
    });
    return elements.get(id);
  };
  elements.set('resort-list', list);
  const document = {
    getElementById,
    createElement: () => ({ dataset: {} })
  };
  const context = vm.createContext({
    document,
    window: { UserBookingFeature: { renderCaptcha() {} } },
    showUserTab: (tab) => selectedTabs.push(tab),
    escapeHtml: String
  });
  vm.runInContext(readFileSync(new URL('./resorts.js', import.meta.url), 'utf8'), context);
  const resort = {
    id: 'resort-1', name: 'Mountain Resort', address: 'Barangay A',
    services: [{ id: 'pool', name: 'Pool access', fee: 250, pricingUnit: 'per guest', type: 'day' }]
  };
  context.window.UserResortsFeature.render({ resorts: [resort], barangays: [] });
  context.window.UserResortsFeature.select(resort.id);

  assert.equal(getElementById('resort-detail').hidden, false);
  assert.equal(getElementById('selected-resort-name').textContent, resort.name);
  assert.match(getElementById('selected-resort-services').innerHTML, /Pool access/);
  assert.match(getElementById('resort-service').children[0].textContent, /250/);
  assert.deepEqual(selectedTabs, ['user-resorts']);
});
