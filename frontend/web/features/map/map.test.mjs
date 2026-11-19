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

function renderMap(attraction, hasAttractionsPage = false, announcements = [], showcases = []) {
  const markers = [];
  const map = { setView() { return this; }, fitBounds() {} };
  const mapElement = element();
  mapElement.querySelectorAll = () => [];
  const announcementList = element();
  const announcementEmpty = element();
  const viewMore = element('button');
  const details = { innerHTML: '', querySelector() { return viewMore; } };
  const document = {
    getElementById(id) {
      if (id === 'tourist-map') return mapElement;
      if (id === 'tourist-map-details') return details;
      if (id === 'tourist-announcements') return announcementList;
      if (id === 'tourist-announcements-empty' && hasAttractionsPage) return announcementEmpty;
      if (id === 'user-attractions' && hasAttractionsPage) return {};
      return null;
    },
    createElement: element
  };
  const selected = [];
  let currentTime = Date.now();
  let refreshAnnouncements;
  const window = {
    location: {},
    setTimeout: (callback) => { refreshAnnouncements = callback; return 1; },
    clearTimeout() {},
    L: {
      map() { return map; },
      marker() {
        const marker = {
          addTo() { return this; },
          bindTooltip() {},
          bindPopup(content) { this.popup = content; },
          on(event, handler) { this[event] = handler; },
          openPopup() { this.openCount = (this.openCount || 0) + 1; }
        };
        markers.push(marker);
        return marker;
      },
      tileLayer() { return { addTo() {} }; }
    },
    UserAttractionsFeature: { select(item) { selected.push(item); } }
  };
  const tabs = [];
  const context = vm.createContext({
    window, document, touristMapInstance: null,
    Date: class extends Date { static now() { return currentTime; } },
    getAttractionCoords: () => [14.73, 121.15],
    supabaseClient: { storage: { from: () => ({ getPublicUrl: (path) => ({ data: { publicUrl: `https://example.test/${path}` } }) }) } },
    showUserTab: (tab) => tabs.push(tab),
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  });
  vm.runInContext(readFileSync(new URL('./map.js', import.meta.url), 'utf8'), context);
  window.UserMapFeature.render({ attractions: attraction ? [attraction] : [], showcases, announcements });
  const pinPanel = mapElement.children.find((child) => child.className === 'map-pin-panel');
  return {
    marker: markers[0], markers, details, pin: pinPanel?.children[0], pinPanel, selected, viewMore, window, tabs, announcementList, announcementEmpty,
    refreshAnnouncementsAt(time) {
      currentTime = Date.parse(time);
      refreshAnnouncements?.();
    }
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

test('a showcase-only place gets a map pin and info without attraction booking actions', () => {
  const showcase = {
    id: 'showcase-1', name: 'Riverside lookout', description: 'A quiet view of the river.',
    latitude: 14.7, longitude: 121.1
  };
  const { markers, pinPanel, details, selected } = renderMap(null, false, [], [showcase]);
  assert.ok(pinPanel, 'showcase pins should be included when there are no attractions');
  assert.equal(markers.length, 1);
  assert.equal(pinPanel.children.length, 1);
  markers[0].click();
  assert.match(details.innerHTML, /Riverside lookout/);
  assert.match(details.innerHTML, /A quiet view of the river/);
  assert.doesNotMatch(details.innerHTML, /Fee:|View more|Book|Guide/i);
  assert.deepEqual(selected, []);
});

test('the map highlights upcoming announcements in start-time order and hides ended events', () => {
  const { announcementList } = renderMap({ name: 'Mountain', images: [] }, false, [
    { id: 'later', title: 'Later event', starts_at: '2099-02-01T18:00:00Z', ends_at: '2099-02-01T20:00:00Z', banner_path: 'later.jpg' },
    { id: 'ended', title: 'Past event', starts_at: '2000-02-01T18:00:00Z', ends_at: '2000-02-01T20:00:00Z', banner_path: 'past.jpg' },
    { id: 'soon', title: 'Soon event', starts_at: '2099-01-01T18:00:00Z', ends_at: '2099-01-01T20:00:00Z', banner_path: 'soon.jpg' }
  ]);
  assert.match(announcementList.innerHTML, /Soon event/);
  assert.ok(announcementList.innerHTML.indexOf('Soon event') < announcementList.innerHTML.indexOf('Later event'));
  assert.doesNotMatch(announcementList.innerHTML, /Past event/);
});

test('announcements have their own traveler tab instead of appearing in the map tab', () => {
  const html = readFileSync(new URL('../../../../apps/web/user.html', import.meta.url), 'utf8');
  const mapSection = html.match(/<section id="user-map"[\s\S]*?<\/section>/)?.[0];
  const announcementsSection = html.match(/<section id="user-announcements"[\s\S]*?<\/section>/)?.[0];
  assert.match(html, /data-user-tab="user-announcements"/);
  assert.ok(announcementsSection);
  assert.match(announcementsSection, /id="tourist-announcements"/);
  assert.doesNotMatch(mapSection, /id="tourist-announcements"/);
});

test('the announcements tab shows an empty state when events have ended', () => {
  const { announcementList, announcementEmpty, refreshAnnouncementsAt } = renderMap(
    { name: 'Mountain', images: [] }, true,
    [{ title: 'Market', starts_at: '2099-01-01T18:00:00Z', ends_at: '2099-01-01T18:01:00Z' }]
  );
  assert.equal(announcementEmpty.hidden, true);
  refreshAnnouncementsAt('2099-01-01T18:01:01Z');
  assert.equal(announcementList.hidden, true);
  assert.equal(announcementEmpty.hidden, false);
});

test('an announcement disappears from an already-open map after it ends', () => {
  const { announcementList, refreshAnnouncementsAt } = renderMap({ name: 'Mountain', images: [] }, false, [
    { id: 'event', title: 'Market', starts_at: '2099-01-01T18:00:00Z', ends_at: '2099-01-01T18:01:00Z' }
  ]);
  assert.match(announcementList.innerHTML, /Market/);
  refreshAnnouncementsAt('2099-01-01T18:01:01Z');
  assert.doesNotMatch(announcementList.innerHTML, /Market/);
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
