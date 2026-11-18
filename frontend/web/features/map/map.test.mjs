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

function renderMap(attraction, hasAttractionsPage = false) {
  const marker = {
    addTo() { return this; },
    bindTooltip() {},
    bindPopup(content) { this.popup = content; },
    on(event, handler) { this[event] = handler; },
    openPopup() { this.openCount = (this.openCount || 0) + 1; }
  };
  const map = { setView() { return this; }, fitBounds() {} };
  const mapElement = element();
  mapElement.querySelectorAll = () => [];
  const viewMore = element('button');
  const details = { innerHTML: '', querySelector() { return viewMore; } };
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
  const window = {
    location: {},
    L: {
      map() { return map; },
      marker() { return marker; },
      tileLayer() { return { addTo() {} }; }
    },
    UserAttractionsFeature: { select(item) { selected.push(item); } }
  };
  const tabs = [];
  const context = vm.createContext({
    window, document, touristMapInstance: null,
    getAttractionCoords: () => [14.73, 121.15],
    showUserTab: (tab) => tabs.push(tab),
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  });
  vm.runInContext(readFileSync(new URL('./map.js', import.meta.url), 'utf8'), context);
  window.UserMapFeature.render({ attractions: [attraction] });
  const pinPanel = mapElement.children.find((child) => child.className === 'map-pin-panel');
  return { marker, details, pin: pinPanel.children[0], selected, viewMore, window, tabs };
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
