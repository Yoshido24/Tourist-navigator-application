import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

function element(tagName = 'div') {
  return {
    tagName,
    children: [],
    className: '',
    set innerHTML(value) { this.html = value; this.children = []; },
    get innerHTML() { return this.html || ''; },
    setAttribute(name, value) { this[name] = value; },
    appendChild(child) { this.children.push(child); },
    addEventListener(event, handler) { this[event] = handler; }
  };
}

function renderMap(attraction, hasAttractionsPage = false, options = {}) {
  const markers = [];
  const map = { setView() { return this; }, fitBounds() {}, remove() {} };
  const mapElement = element();
  mapElement.querySelectorAll = () => [];
  const viewMore = element('button');
  const chooseServices = element('button');
  const details = {
    innerHTML: '',
    querySelector(selector) { return selector === '.map-select-resort' ? chooseServices : viewMore; }
  };
  const document = {
    getElementById(id) {
      if (id === 'tourist-map') return mapElement;
      if (id === 'tourist-map-details') return details;
      if (id === 'user-attractions' && hasAttractionsPage) return {};
      return null;
    },
    createElement: element
  };
  const selected = [];
  const selectedResorts = [];
  const window = {
    location: {},
    L: {
      map() { return map; },
      marker(coords) {
        const marker = {
          coords,
          addTo() { return this; },
          bindTooltip(value) { this.tooltip = value; },
          bindPopup(content) { this.popup = content; },
          on(event, handler) { this[event] = handler; },
          openPopup() { this.openCount = (this.openCount || 0) + 1; }
        };
        markers.push(marker);
        return marker;
      },
      tileLayer() { return { addTo() {} }; }
    },
    UserAttractionsFeature: {
      select(item) { selected.push(item); },
      getActiveCategory: () => options.category || 'all',
      filterByCategory(items, category) {
        if (category === 'all') return items;
        return items.filter((item) => String(item.category || '').trim().toLowerCase() === category);
      }
    },
    UserResortsFeature: { select(id) { selectedResorts.push(id); } }
  };
  const tabs = [];
  const context = vm.createContext({
    window, document, touristMapInstance: null,
    getAttractionCoords: () => [14.73, 121.15],
    showUserTab: (tab) => tabs.push(tab),
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  });
  vm.runInContext(readFileSync(new URL('./map.js', import.meta.url), 'utf8'), context);
  window.UserMapFeature.render({ attractions: options.attractions ?? [attraction], resorts: options.resorts || [], barangays: options.barangays || [] });
  const pinPanel = mapElement.children.find((child) => child.className === 'map-pin-panel');
  return {
    marker: markers[0], markers, details, pinPanel, pin: pinPanel?.children[0],
    selected, selectedResorts, chooseServices, viewMore, window, tabs
  };
}

test('a pin shows one photo at a time and its information below the map', () => {
  const attraction = {
    id: 'one', name: 'Mountain', description: 'Private description', fee: '123 pesos',
    trail: 'Long trail', images: '["first.jpg","second.jpg"]'
  };
  const { marker, details, pin, selected } = renderMap(attraction);

  assert.equal(typeof marker.popup, 'object');
  for (const select of [marker.click, pin.click]) {
    select();
    const image = marker.popup.children.find((child) => child.tagName === 'img');
    const controls = marker.popup.children.find((child) => child.className === 'map-photo-controls');
    assert.equal(image.src, 'first.jpg');
    assert.equal(marker.popup.children.filter((child) => child.tagName === 'img').length, 1);
    controls.children[2].click();
    assert.equal(image.src, 'second.jpg');
    assert.equal(controls.children[1].textContent, '2 / 2');
    controls.children[0].click();
    assert.equal(image.src, 'first.jpg');
    assert.match(details.innerHTML, /Mountain/);
    assert.match(details.innerHTML, /Private description/);
    assert.match(details.innerHTML, /123 pesos/);
    assert.match(details.innerHTML, /Long trail/);
    assert.doesNotMatch(details.innerHTML, /first\.jpg|second\.jpg/);
  }
  assert.equal(marker.openCount, 2);
  assert.deepEqual(selected, [attraction, attraction]);
});

test('a pin without photos shows an informative empty state', () => {
  const { marker, details } = renderMap({ name: 'Mountain', images: [] });
  marker.click();
  assert.equal(typeof marker.popup, 'object');
  assert.match(marker.popup.children[0].textContent, /No images available/i);
  assert.match(details.innerHTML, /Mountain/);
});

test('a single photo does not show carousel controls', () => {
  const { marker } = renderMap({ name: 'Mountain', images: ['first.jpg'] });
  assert.equal(typeof marker.popup, 'object');
  assert.equal(marker.popup.children[0].src, 'first.jpg');
  assert.equal(marker.popup.children.length, 1);
});

test('view more opens the attractions page from either map', () => {
  const attraction = { name: 'Mountain', images: [] };
  const landing = renderMap(attraction);
  landing.marker.click();
  landing.viewMore.click();
  assert.equal(landing.window.location.href, 'user.html');

  const tourist = renderMap(attraction, true);
  tourist.marker.click();
  tourist.viewMore.click();
  assert.deepEqual(tourist.tabs, ['user-attractions']);
});

test('map markers and accessible pin buttons match the selected attraction category', () => {
  const falls = { id: 'falls', name: 'Falls', category: 'Falls', images: [] };
  const hiking = { id: 'hiking', name: 'Trail', category: 'Hiking', images: [] };
  const filtered = renderMap(null, false, { attractions: [falls, hiking], category: 'falls' });
  assert.equal(filtered.markers.length, 1);
  assert.equal(filtered.marker.tooltip, 'Falls');
  assert.equal(filtered.pinPanel.children.length, 1);

  const all = renderMap(null, false, {
    attractions: [falls, hiking, { id: 'legacy', name: 'Legacy', images: [] }]
  });
  assert.equal(all.markers.length, 3);
  assert.equal(all.pinPanel.children.length, 3);
});

test('Resort category maps valid approved resorts even when there are no attractions', () => {
  const resort = {
    id: 'resort-1', name: 'Mountain Resort', coords: [14.74, 121.16],
    services: [{ id: 'pool', name: 'Pool access', fee: 250, pricingUnit: 'per guest' }]
  };
  const result = renderMap(null, false, { attractions: [], resorts: [resort], category: 'resort' });

  assert.equal(result.markers.length, 1);
  assert.deepEqual(Array.from(result.marker.coords), [14.74, 121.16]);
  assert.equal(result.pinPanel.children.length, 1);
  result.marker.click();
  assert.match(result.details.innerHTML, /Pool access/);
  assert.match(result.details.innerHTML, /250/);
  result.chooseServices.click();
  assert.deepEqual(result.selectedResorts, ['resort-1']);
});

test('resorts without valid coordinates are not given fallback map pins', () => {
  const resorts = [
    { id: 'missing', name: 'Missing pin', coords: null },
    { id: 'bad-latitude', name: 'Bad pin', coords: [91, 121.15] },
    { id: 'bad-longitude', name: 'Bad pin 2', coords: [14.73, 181] }
  ];
  const result = renderMap(null, false, { attractions: [], resorts, category: 'resort' });
  assert.equal(result.markers.length, 0);
});
