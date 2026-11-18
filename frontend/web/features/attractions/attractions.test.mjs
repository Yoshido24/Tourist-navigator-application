import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const featurePath = new URL('./attractions.js', import.meta.url);

test('filters attractions by category without excluding uncategorized items from All', () => {
  const context = vm.createContext({ window: {} });
  vm.runInContext(readFileSync(featurePath, 'utf8'), context);
  const result = vm.runInContext(`(() => {
    const items = [
      { id: 'a', category: 'Adventure' },
      { id: 'h', category: 'Hiking' },
      { id: 'u' }
    ];
    return {
      hiking: window.UserAttractionsFeature.filterByCategory(items, 'hiking').map((item) => item.id),
      all: window.UserAttractionsFeature.filterByCategory(items, 'all').map((item) => item.id)
    };
  })()`, context);
  assert.deepEqual(Array.from(result.hiking), ['h']);
  assert.deepEqual(Array.from(result.all), ['a', 'h', 'u']);
});

test('normalizes saved and selected category names while retaining legacy categories', () => {
  const context = vm.createContext({ window: { ATTRACTION_CATEGORIES: ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls'] } });
  vm.runInContext(readFileSync(featurePath, 'utf8'), context);
  const result = vm.runInContext(`(() => {
    const items = [
      { id: 'falls', category: '  fAlLs  ' },
      { id: 'legacy', category: 'Nature' },
      { id: 'uncategorized' }
    ];
    return {
      falls: window.UserAttractionsFeature.filterByCategory(items, ' Falls ').map((item) => item.id),
      legacy: window.UserAttractionsFeature.filterByCategory(items, 'nature').map((item) => item.id),
      all: window.UserAttractionsFeature.filterByCategory(items, 'all').map((item) => item.id)
    };
  })()`, context);
  assert.deepEqual(Array.from(result.falls), ['falls']);
  assert.deepEqual(Array.from(result.legacy), ['legacy']);
  assert.deepEqual(Array.from(result.all), ['falls', 'legacy', 'uncategorized']);
});

test('category selectors share standard, resort, and saved legacy options', () => {
  let change;
  const selects = ['map-category-filter', 'attraction-category-filter'].map((id) => ({
    id, value: 'all', dataset: {}, innerHTML: '',
    addEventListener(event, handler) { if (event === 'change') change = handler; }
  }));
  const list = {
    innerHTML: '', children: [],
    appendChild(child) { this.children.push(child); }
  };
  const mapRenders = [];
  const elements = new Map([
    ['attraction-selector', list],
    ['place', { value: '', innerHTML: '', dataset: {}, addEventListener() {}, appendChild() {} }]
  ]);
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '' });
      return elements.get(id);
    },
    querySelectorAll(selector) {
      if (selector === '[data-attraction-category]') return selects;
      if (selector === '.attraction-option') return list.children;
      return [];
    },
    createElement() {
      return { addEventListener() {}, classList: { toggle() {} }, setAttribute() {} };
    }
  };
  const context = vm.createContext({
    document,
    selectedUserAttractionId: null,
    window: {
      ATTRACTION_CATEGORIES: ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls'],
      UserDirectionsFeature: { reset() {}, render() {} },
      UserMapFeature: { render(state) { mapRenders.push(state); } }
    },
    escapeHtml: String
  });
  vm.runInContext(readFileSync(featurePath, 'utf8'), context);
  context.window.UserAttractionsFeature.render({
    attractions: [{ id: '1', name: 'Falls', category: 'Falls' }, { id: '2', name: 'Old Site', category: 'Nature' }]
  });
  selects[1].value = 'nature';
  change?.();

  for (const select of selects) {
    for (const category of ['All', 'Adventure', 'Hiking', 'Camping', 'Historical', 'Falls', 'Resort', 'Nature']) {
      assert.match(select.innerHTML, new RegExp(category));
    }
    assert.equal(select.value, 'nature');
  }
  assert.equal(context.window.UserAttractionsFeature.getActiveCategory(), 'nature');
  assert.equal(mapRenders.length, 1);
});
