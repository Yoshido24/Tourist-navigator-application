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
      { id: 'legacy-h', category: 'Mountain / Hiking Destination' },
      { id: 'legacy-f', category: 'Waterfall / Natural Attraction' },
      { id: 'u' }
    ];
    return {
      hiking: window.UserAttractionsFeature.filterByCategory(items, 'hiking').map((item) => item.id),
      falls: window.UserAttractionsFeature.filterByCategory(items, 'falls').map((item) => item.id),
      all: window.UserAttractionsFeature.filterByCategory(items, 'all').map((item) => item.id)
    };
  })()`, context);
  assert.deepEqual(Array.from(result.hiking), ['h', 'legacy-h']);
  assert.deepEqual(Array.from(result.falls), ['legacy-f']);
  assert.deepEqual(Array.from(result.all), ['a', 'h', 'legacy-h', 'legacy-f', 'u']);
});

test('category results include resorts and update from the latest data', () => {
  const filters = ['all', 'adventure', 'hiking', 'camping', 'historical', 'resorts'].map((category) => ({
    dataset: { attractionCategory: category },
    classList: { toggle() {} },
    setAttribute() {},
    addEventListener(_event, handler) { this.click = handler; }
  }));
  const list = {
    children: [],
    set innerHTML(value) { this.html = value; this.children = []; },
    get innerHTML() { return this.html; },
    appendChild(child) { this.children.push(child); }
  };
  const detail = { hidden: false };
  const document = {
    getElementById(id) { return { 'attraction-selector': list, 'attraction-detail-card': detail }[id] || null; },
    querySelectorAll(selector) { return selector === '[data-attraction-category]' ? filters : []; },
    createElement() { return { addEventListener(_event, handler) { this.click = handler; } }; }
  };
  const tabs = [];
  const selected = [];
  const window = { UserResortsFeature: { select(resort) { selected.push(resort.id); } } };
  const context = vm.createContext({ window, document, escapeHtml: String, selectedUserAttractionId: null, showUserTab: (tab) => tabs.push(tab) });
  vm.runInContext(readFileSync(featurePath, 'utf8'), context);
  window.UserAttractionsFeature.render({
    attractions: [
      { id: 'a', name: 'Adventure park', category: 'Adventure' },
      { id: 'h', name: 'Trail', category: 'Hiking' },
      { id: 'c', name: 'Campsite', category: 'Camping' },
      { id: 'old', name: 'Old landmark', category: 'Historical' }
    ],
    resorts: [{ id: 'r', name: 'Pool' }]
  });
  assert.equal(list.children.length, 5);
  for (const [index, name] of [[1, 'Adventure park'], [2, 'Trail'], [3, 'Campsite'], [4, 'Old landmark']]) {
    filters[index].click();
    assert.equal(list.children.length, 1);
    assert.match(list.children[0].innerHTML, new RegExp(name));
  }
  filters[5].click();
  assert.equal(list.children.length, 1);
  assert.match(list.children[0].innerHTML, /Pool/);
  assert.equal(detail.hidden, true);
  list.children[0].click();
  assert.deepEqual(tabs, ['user-resorts']);
  assert.deepEqual(selected, ['r']);
  window.UserAttractionsFeature.render({ attractions: [], resorts: [{ id: 'new', name: 'New resort' }] });
  filters[0].click();
  assert.equal(detail.hidden, false);
  assert.equal(list.children.length, 1);
  assert.match(list.children[0].innerHTML, /New resort/);
});

test('categories appear under Attractions, not on the maps', () => {
  const expected = ['All', 'Adventure', 'Hiking', 'Camping', 'Historical', 'Resorts'];
  for (const file of ['../../../../apps/web/index.html', '../../../../apps/web/user.html']) {
    const html = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /id="tourist-map-category"/);
    if (file.endsWith('user.html')) {
      const filters = html.match(/<div class="category-filters"[\s\S]*?<\/div>/)[0];
      assert.deepEqual(Array.from(filters.matchAll(/data-attraction-category="[^"]+"[^>]*>([^<]+)<\/button>/g), (match) => match[1]), expected);
    }
  }
});
