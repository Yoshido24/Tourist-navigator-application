import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function createFeatureContext() {
  const elements = new Map();
  const formHandlers = [];
  const selectedTabs = [];
  const removedMarkers = [];
  const createdMarkers = [];
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, {
      value: '', innerHTML: '', dataset: {}, children: [],
      addEventListener(event, handler) {
        this[event] = handler;
        if (id === 'add-attraction-form' && event === 'submit') formHandlers.push(handler);
      },
      appendChild(child) { this.children.push(child); },
      scrollIntoView() {},
      reset() {}
    });
    return elements.get(id);
  };
  const map = {
    setView() { return this; },
    on(event, handler) { this[event] = handler; },
    removeLayer(marker) { removedMarkers.push(marker); },
    invalidateSize() {}
  };
  const editButton = { addEventListener: (_, handler) => { editButton.handler = handler; } };
  const list = getElementById('admin-attractions-list');
  list.appendChild = (card) => { list.card = card; };
  const context = vm.createContext({
    document: {
      getElementById,
      createElement: () => ({ appendChild() {}, querySelector: () => editButton }),
      querySelector: (selector) => selector === '[data-attraction-view="attraction-add-panel"]'
        ? { click: () => selectedTabs.push('attraction-add-panel') }
        : null
    },
    window: {
      ATTRACTION_CATEGORIES: ['Adventure', 'Hiking', 'Camping', 'Historical', 'Falls'],
      L: {
        map: () => map,
        tileLayer: () => ({ addTo() {} }),
        marker: (coords) => {
          const marker = { coords, addTo() { return this; }, bindTooltip() {}, on() {} };
          createdMarkers.push(marker);
          return marker;
        }
      },
      AdminTransportFeature: { loadOptions() {}, readOptions: () => [] },
      setTimeout: (callback) => callback()
    },
    getAttractionCoords: (attraction) => attraction.coords || [14.73, 121.15],
    escapeHtml: String
  });
  vm.runInContext(readFileSync(new URL('./attractions.js', import.meta.url), 'utf8'), context);
  return { context, elements, formHandlers, selectedTabs, editButton, removedMarkers, createdMarkers, map };
}

test('selecting an attraction populates the shared edit form and retains its saved location', () => {
  const { context, elements, formHandlers, selectedTabs } = createFeatureContext();
  const attraction = {
    id: 'falls-1', name: 'Falls', category: 'Nature', description: 'Waterfall',
    fee: '50', duration: '2 hours', coords: [14.75, 121.17]
  };
  context.window.AdminAttractionsFeature.renderMap({ attractions: [attraction] });
  context.window.AdminAttractionsFeature.renderMap({ attractions: [attraction] });

  context.window.AdminAttractionsFeature.selectForEdit(attraction);

  assert.equal(elements.get('attraction-name').value, 'Falls');
  assert.equal(elements.get('attraction-category').value, 'Nature');
  assert.match(elements.get('attraction-category').innerHTML, /Adventure/);
  assert.equal(elements.get('attraction-category').children.some((option) => option.value === 'Nature'), true);
  assert.equal(elements.get('attraction-position-x').value, '14.750000');
  assert.equal(elements.get('attraction-position-y').value, '121.170000');
  assert.equal(formHandlers.length, 1);
  assert.deepEqual(selectedTabs, ['attraction-add-panel']);
});

test('attraction list exposes an Edit action for each saved attraction', () => {
  const { context, editButton } = createFeatureContext();
  const attraction = { id: 'falls-1', name: 'Falls', category: 'Falls' };
  let selected;
  context.window.AdminAttractionsFeature.selectForEdit = (item) => { selected = item; };

  context.window.AdminAttractionsFeature.renderList({ attractions: [attraction] });
  editButton.handler();

  assert.equal(selected, attraction);
});

test('saving an edited attraction after a dashboard refresh keeps its id and saved coordinates', async () => {
  const { context, elements, formHandlers } = createFeatureContext();
  const attraction = {
    id: 'falls-1', name: 'Falls', category: 'Falls', description: 'Waterfall',
    fee: '50', duration: '2 hours', coords: [14.75, 121.17]
  };
  let state = { attractions: [attraction] };
  let savedState;
  context.FormData = class {
    get(name) {
      return ({
        name: 'Updated Falls', category: 'Falls', fee: '50', duration: '2 hours',
        description: 'Updated description', trail: '', expectations: '', terrain: '',
        startPoint: '', image: '', positionX: elements.get('attraction-position-x').value,
        positionY: elements.get('attraction-position-y').value
      })[name] || '';
    }
  };
  context.updateState = async (update) => {
    state = update(state);
    savedState = state;
    return state;
  };
  context.window.alert = () => {};
  context.window.crypto = { randomUUID: () => 'new-id' };

  context.window.AdminAttractionsFeature.renderMap({ attractions: [attraction] });
  context.window.AdminAttractionsFeature.renderMap({ attractions: [attraction] });
  context.window.AdminAttractionsFeature.selectForEdit(attraction);
  await formHandlers[0]({ preventDefault() {} });

  assert.equal(savedState.attractions.length, 1);
  assert.equal(savedState.attractions[0].id, 'falls-1');
  assert.deepEqual(Array.from(savedState.attractions[0].coords), [14.75, 121.17]);
  assert.equal(savedState.attractions[0].name, 'Updated Falls');
});

test('confirming a pin choice removes its temporary marker from the admin map', () => {
  const { context, elements, removedMarkers, createdMarkers, map } = createFeatureContext();
  context.window.AdminAttractionsFeature.renderMap({ attractions: [] });
  elements.get('new-attraction-btn').click();
  map.click({ latlng: { lat: 14.75, lng: 121.17 } });
  const temporaryMarker = createdMarkers[createdMarkers.length - 1];

  elements.get('confirm-pin-location').click();

  assert.equal(removedMarkers.includes(temporaryMarker), true);
  assert.equal(elements.get('pin-picker-modal').hidden, true);
  assert.equal(elements.get('attraction-position-x').value, '14.750000');
});
