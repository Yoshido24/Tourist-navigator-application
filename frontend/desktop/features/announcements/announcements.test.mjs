import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('./announcements.js', import.meta.url), 'utf8');

test('municipal admin page exposes the announcement form and feature script', () => {
  const html = readFileSync(new URL('../../../../apps/desktop/admin.html', import.meta.url), 'utf8');
  const portal = readFileSync(new URL('../../js/portal.js', import.meta.url), 'utf8');
  assert.match(html, /data-admin-tab="announcements"/);
  assert.match(html, /id="announcement-form"/);
  assert.match(html, /id="announcement-banner" type="file"/);
  assert.match(html, /features\/announcements\/announcements\.js/);
  assert.match(portal, /AdminAnnouncementsFeature\?\.render/);
  assert.match(portal, /AdminAnnouncementsFeature\?\.setup/);
});

function createHarness({
  announcements = [],
  file = { name: 'event.jpg', type: 'image/jpeg', size: 1024 },
  insertError = null,
  removeError = null
} = {}) {
  const fields = {
    'announcement-id': { value: '' },
    'announcement-title': { value: 'Night market' },
    'announcement-description': { value: 'Food and music' },
    'announcement-organizer': { value: 'Tourism Office' },
    'announcement-venue': { value: 'Town plaza' },
    'announcement-starts-at': { value: '2099-01-01T18:00' },
    'announcement-ends-at': { value: '2099-01-01T21:00' },
    'announcement-banner': { files: file ? [file] : [] },
    'announcement-message': { hidden: true, textContent: '', classList: { toggle() {} } },
    'announcement-submit': { disabled: false, textContent: '' },
    'announcement-cancel': { addEventListener() {} }
  };
  const form = {
    dataset: {},
    addEventListener(event, handler) { if (event === 'submit') this.submit = handler; },
    scrollIntoView() {},
    reset() {}
  };
  const deleteButton = {
    dataset: { deleteAnnouncement: announcements[0]?.id },
    addEventListener(event, handler) { if (event === 'click') this.click = handler; }
  };
  const editButton = {
    dataset: { editAnnouncement: announcements[0]?.id },
    addEventListener(event, handler) { if (event === 'click') this.click = handler; }
  };
  const list = {
    innerHTML: '',
    querySelectorAll(selector) {
      if (!announcements.length) return [];
      if (selector === '[data-delete-announcement]') return [deleteButton];
      if (selector === '[data-edit-announcement]') return [editButton];
      return [];
    }
  };
  const uploaded = [];
  const removed = [];
  const inserted = [];
  const updated = [];
  const deleted = [];
  const document = {
    getElementById(id) {
      if (id === 'announcement-form') return form;
      if (id === 'announcements-list') return list;
      return fields[id] || null;
    }
  };
  const supabaseClient = {
    storage: {
      from(bucket) {
        return {
          async upload(path, uploadedFile) { uploaded.push({ bucket, path, file: uploadedFile }); return { error: null }; },
          getPublicUrl(path) { return { data: { publicUrl: `https://example.test/${path}` } }; },
          async remove(paths) {
            removed.push(paths);
            if (removeError && paths.includes('old-banner.jpg')) throw removeError;
            return { error: null };
          }
        };
      }
    },
    from(table) {
      return {
        async insert(row) { inserted.push({ table, row }); return { error: insertError }; },
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
  const appState = { announcements: [...announcements] };
  const window = { confirm: () => true };
  class LocalTimeDate extends Date {
    getTimezoneOffset() { return -480; }
  }
  const context = vm.createContext({
    window, document, supabaseClient, appState,
    Date: LocalTimeDate,
    crypto: { randomUUID: () => 'event-id' },
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    console
  });
  vm.runInContext(source, context);
  context.window.AdminAnnouncementsFeature.setup();
  return { appState, context, deleted, fields, form, inserted, list, removed, updated, uploaded, window };
}

test('municipal admins upload a banner and save the event announcement', async () => {
  const harness = createHarness();
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.uploaded[0].bucket, 'event-banners');
  assert.equal(harness.uploaded[0].file.name, 'event.jpg');
  assert.equal(harness.inserted[0].table, 'announcements');
  assert.equal(harness.inserted[0].row.title, 'Night market');
  assert.equal(harness.inserted[0].row.banner_path, harness.uploaded[0].path);
  assert.equal(harness.fields['announcement-message'].textContent, 'Announcement published.');
});

test('failed announcement saves remove the just-uploaded banner', async () => {
  const harness = createHarness({ insertError: new Error('Database unavailable') });
  await harness.form.submit({ preventDefault() {} });
  assert.deepEqual(Array.from(harness.removed, (paths) => Array.from(paths)), [[harness.uploaded[0].path]]);
  assert.match(harness.fields['announcement-message'].textContent, /Database unavailable/);
});

test('unsupported banner files are rejected before upload', async () => {
  const harness = createHarness({ file: { name: 'banner.svg', type: 'image/svg+xml', size: 1024 } });
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.uploaded.length, 0);
  assert.match(harness.fields['announcement-message'].textContent, /JPEG, PNG or WebP/);
});

test('an event ending before it starts is rejected before upload', async () => {
  const harness = createHarness();
  harness.fields['announcement-ends-at'].value = '2099-01-01T17:00';
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.uploaded.length, 0);
  assert.match(harness.fields['announcement-message'].textContent, /valid event start and end time/);
});

test('editing an announcement preserves its current banner when no replacement is selected', async () => {
  const existing = {
    id: 'event-1', title: 'Old event', description: 'Old details', organizer: 'Town',
    venue: 'Square', starts_at: '2099-01-01T18:00:00Z', ends_at: '2099-01-01T21:00:00Z',
    banner_path: 'event-1.jpg'
  };
  const harness = createHarness({ announcements: [existing], file: null });
  harness.fields['announcement-id'].value = existing.id;
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.updated[0].row.banner_path, existing.banner_path);
  assert.equal(harness.uploaded.length, 0);
});

test('a failed old-banner cleanup does not remove the newly saved banner', async () => {
  const existing = {
    id: 'event-1', title: 'Old event', description: 'Old details', organizer: 'Town',
    venue: 'Square', starts_at: '2099-01-01T18:00:00Z', ends_at: '2099-01-01T21:00:00Z',
    banner_path: 'old-banner.jpg'
  };
  const harness = createHarness({
    announcements: [existing],
    removeError: new Error('Storage unavailable')
  });
  harness.fields['announcement-id'].value = existing.id;
  await harness.form.submit({ preventDefault() {} });
  assert.equal(harness.appState.announcements[0].banner_path, harness.uploaded[0].path);
  assert.deepEqual(Array.from(harness.removed, (paths) => Array.from(paths)), [['old-banner.jpg']]);
});

test('editing an announcement shows stored times in the browser local timezone', () => {
  const existing = {
    id: 'event-1', title: 'Night market', description: 'Details', organizer: 'Town',
    venue: 'Town plaza', starts_at: '2099-01-01T18:00:00Z', ends_at: '2099-01-01T21:00:00Z',
    banner_path: 'event-1.jpg'
  };
  const harness = createHarness({ announcements: [existing], file: null });
  harness.context.window.AdminAnnouncementsFeature.render([existing]);
  harness.list.querySelectorAll('[data-edit-announcement]')[0].click();
  assert.equal(harness.fields['announcement-starts-at'].value, '2099-01-02T02:00');
  assert.equal(harness.fields['announcement-ends-at'].value, '2099-01-02T05:00');
});

test('deleting an announcement removes its banner after deleting the record', async () => {
  const existing = {
    id: 'event-1', title: 'Night market', starts_at: '2099-01-01T18:00:00Z',
    ends_at: '2099-01-01T21:00:00Z', venue: 'Town plaza', organizer: 'Tourism Office',
    banner_path: 'event-1.jpg'
  };
  const harness = createHarness({ announcements: [existing], file: null });
  harness.context.window.AdminAnnouncementsFeature.render([existing]);
  await harness.list.querySelectorAll('[data-delete-announcement]')[0].click?.();
  assert.deepEqual(harness.deleted, [{ table: 'announcements', id: existing.id }]);
  assert.deepEqual(Array.from(harness.removed, (paths) => Array.from(paths)), [[existing.banner_path]]);
});
