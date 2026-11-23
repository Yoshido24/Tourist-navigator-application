import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('guide overview counts only that guide’s active and completed tours', () => {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', innerHTML: '', appendChild() {} });
      return elements.get(id);
    },
    addEventListener() {},
    createElement() { return {}; }
  };
  const context = vm.createContext({ document, window: {} });
  vm.runInContext(readFileSync(new URL('./portal.js', import.meta.url), 'utf8'), context);
  vm.runInContext("signedInGuideUserId = 'user'", context);
  context.renderGuidePage({
    guides: [{ id: 'guide', auth_user_id: 'user', status: 'Approved' }],
    bookings: [
      { guide_id: 'guide', status: 'Assigned', date: '2026-12-01' },
      { guide_id: 'guide', status: 'Ongoing', date: '2026-12-02' },
      { guide_id: 'guide', status: 'Completed', date: '2026-11-01' },
      { guide_id: 'other', status: 'Completed', date: '2026-11-02' }
    ]
  });
  assert.equal(document.getElementById('guide-stat-active').textContent, '2');
  assert.equal(document.getElementById('guide-stat-completed').textContent, '1');
  context.window.lastLoadErrors = { bookings: new Error('Offline') };
  context.renderGuidePage({ guides: [{ id: 'guide', auth_user_id: 'user', status: 'Approved' }], bookings: [] });
  assert.equal(document.getElementById('guide-stat-active').textContent, '—');
  assert.match(document.getElementById('guide-overview-summary').textContent, /could not be loaded/i);
  context.window.lastLoadErrors = {};
  context.window.lastSyncErrors = { bookings: new Error('Offline') };
  context.renderGuidePage({ guides: [{ id: 'guide', auth_user_id: 'user', status: 'Approved' }], bookings: [] });
  assert.equal(document.getElementById('guide-stat-completed').textContent, '—');
  assert.match(document.getElementById('guide-overview-summary').textContent, /could not be saved/i);
});
