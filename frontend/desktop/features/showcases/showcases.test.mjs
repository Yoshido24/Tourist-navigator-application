import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const sourcePath = new URL('./showcases.js', import.meta.url);

test('municipal admin page exposes the Showcase editor', () => {
  const html = readFileSync(new URL('../../../../apps/desktop/admin.html', import.meta.url), 'utf8');
  const portal = readFileSync(new URL('../../js/portal.js', import.meta.url), 'utf8');
  assert.match(html, /data-admin-tab="showcase"/);
  assert.match(html, /id="showcase-form"/);
  assert.match(html, /id="showcase-pin-button"/);
  assert.match(html, /<label for="showcase-latitude">Latitude<\/label>/);
  assert.match(html, /id="showcase-latitude"[^>]*type="number"/);
  assert.match(html, /<label for="showcase-longitude">Longitude<\/label>/);
  assert.match(html, /id="showcase-longitude"[^>]*type="number"/);
  assert.match(html, /features\/showcases\/showcases\.js/);
  assert.match(portal, /AdminShowcaseFeature\?\.render/);
  assert.match(portal, /AdminShowcaseFeature\?\.setup/);
});

function createHarness({ showcases = [] } = {}) {
  const fields = {
    'showcase-id': { value: '' },
    'showcase-name': { value: 'Riverside lookout' },
    'showcase-description': { value: 'A quiet view of the river.' },
    'showcase-latitude': { value: '' },
    'showcase-longitude': { value: '' },
    'showcase-position': { textContent: '' },
    'showcase-pin-button': { addEventListener(event, handler) { if (event === 'click') this.click = handler; } },
    'showcase-pin-modal': { hidden: true, addEventListener() {} },
    'showcase-pin-confirm': { disabled: true, addEventListener(event, handler) { if (event === 'click') this.click = handler; } },
    'showcase-pin-status': { textContent: '' },
    'showcase-message': { hidden: true, textContent: '', classList: { toggle() {} } },
    'showcase-submit': { disabled: false, textContent: '' },
    'showcase-cancel': { addEventListener() {} }
  };
  const form = {
    dataset: {},
    addEventListener(event, handler) { if (event === 'submit') this.submit = handler; },
    reset() {},
    scrollIntoView() {}
  };
  const editButton = {
    dataset: { editShowcase: showcases[0]?.id },
    addEventListener(event, handler) { if (event === 'click') this.click = handler; }
  };
  const deleteButton = {
    dataset: { deleteShowcase: showcases[0]?.id },
    disabled: false,
    addEventListener(event, handler) { if (event === 'click') this.click = handler; }
  };
  const list = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (!showcases.length) return [];
      if (selector === '[data-edit-showcase]') return [editButton];
      if (selector === '[data-delete-showcase]') return [deleteButton];
      return [];
    }
  };
  const inserted = [];
  const updated = [];
  const deleted = [];
  const document = {
    getElementById(id) {
      if (id === 'showcase-form') return form;
      if (id === 'showcases-list') return list;
      return fields[id] || null;
    },
    querySelector() { return null; }
  };
  const supabaseClient = {
    from(table) {
      return {
        async insert(row) { inserted.push({ table, row }); return { error: null }; },
        update(row) {
          updated.push({ table, row });
          return {
            eq(_, id) { this.id = id; return this; },
            select() { return this; },
            async maybeSingle() { return { data: { id: this.id }, error: null }; }
          };
        },
        delete() {
          return {
            eq(_, id) { this.id = id; return this; },
            select() { return this; },
            async maybeSingle() { deleted.push({ table, id: this.id }); return { data: { id: this.id }, error: null }; }
          };
        }
      };
    }
  };
  const appState = { showcases: [...showcases] };
  const mapEvents = {};
  const pickerMap = {
    setView() { return this; },
    on(event, handler) { mapEvents[event] = handler; },
    invalidateSize() {},
    removeLayer() {}
  };
  const context = vm.createContext({
    window: {
      confirm: () => true,
      setTimeout: (callback) => callback(),
      L: {
        map: () => pickerMap,
        tileLayer: () => ({ addTo() {} }),
        marker: () => ({ addTo() { return this; } })
      }
    },
    document,
    supabaseClient,
    appState,
    crypto: { randomUUID: () => 'showcase-id' },
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  });
  if (existsSync(sourcePath)) vm.runInContext(readFileSync(sourcePath, 'utf8'), context);
  context.window.AdminShowcaseFeature?.setup();
  return {
    appState, deleted, fields, feature: context.window.AdminShowcaseFeature, form, inserted, list,
    mapEvents, updated, window: context.window
  };
}

test('municipal admins can save an information-only Showcase place with coordinates', async () => {
  const harness = createHarness();
  assert.ok(harness.form.submit, 'Showcase form should have a submit handler');
  harness.fields['showcase-latitude'].value = '14.7';
  harness.fields['showcase-longitude'].value = '121.1';
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.inserted[0].table, 'showcases');
  assert.equal(harness.inserted[0].row.name, 'Riverside lookout');
  assert.equal(harness.inserted[0].row.description, 'A quiet view of the river.');
  assert.equal(harness.inserted[0].row.latitude, 14.7);
  assert.equal(harness.inserted[0].row.longitude, 121.1);
  assert.equal('fee' in harness.inserted[0].row, false);
  assert.equal('guideAvailable' in harness.inserted[0].row, false);
  assert.equal(harness.appState.showcases[0].id, 'showcase-showcase-id');
});

test('showcase place coordinates must be valid before saving', async () => {
  const harness = createHarness();
  assert.ok(harness.form.submit, 'Showcase form should have a submit handler');
  harness.fields['showcase-longitude'].value = '181';
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.inserted.length, 0);
  assert.match(harness.fields['showcase-message'].textContent, /valid map pin/i);
});

test('choosing a Showcase pin stores the selected map coordinates', () => {
  const harness = createHarness();
  harness.fields['showcase-latitude'].value = '';
  harness.fields['showcase-longitude'].value = '';
  harness.fields['showcase-pin-button'].click();
  harness.mapEvents.click({ latlng: { lat: 14.8, lng: 121.2 } });
  harness.fields['showcase-pin-confirm'].click();
  assert.equal(harness.fields['showcase-latitude'].value, '14.800000');
  assert.equal(harness.fields['showcase-longitude'].value, '121.200000');
});

test('editing a Showcase place updates its description and coordinates', async () => {
  const existing = {
    id: 'showcase-1', name: 'Old name', description: 'Old details', latitude: 14.7, longitude: 121.1
  };
  const harness = createHarness({ showcases: [existing] });
  harness.feature.render([existing]);
  harness.list.querySelectorAll('[data-edit-showcase]')[0].click();
  assert.equal(harness.fields['showcase-name'].value, existing.name);
  harness.fields['showcase-description'].value = 'Updated information.';
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.updated[0].table, 'showcases');
  assert.equal(harness.updated[0].row.description, 'Updated information.');
  assert.equal(harness.appState.showcases[0].description, 'Updated information.');
});

test('deleting a Showcase place removes its database row', async () => {
  const existing = {
    id: 'showcase-1', name: 'Riverside lookout', description: 'A quiet view.', latitude: 14.7, longitude: 121.1
  };
  const harness = createHarness({ showcases: [existing] });
  harness.feature.render([existing]);
  await harness.list.querySelectorAll('[data-delete-showcase]')[0].click();
  assert.equal(harness.deleted.length, 1);
  assert.equal(harness.deleted[0].table, 'showcases');
  assert.equal(harness.deleted[0].id, existing.id);
  assert.equal(Array.from(harness.appState.showcases).length, 0);
});
