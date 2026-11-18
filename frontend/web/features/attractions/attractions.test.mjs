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
