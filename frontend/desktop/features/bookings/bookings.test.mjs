import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('municipal booking overview displays bookings without approval or assignment controls', () => {
  const elements = new Map();
  for (const id of ['management-new-list', 'management-approved-list', 'management-pending-list', 'management-completed-list']) {
    elements.set(id, { innerHTML: '', querySelector: () => null });
  }
  const window = {};
  const context = vm.createContext({
    window, document: { getElementById: (id) => elements.get(id) || null },
    escapeHtml: (v) => String(v), CSS: { escape: (v) => v }
  });
  vm.runInContext(readFileSync(new URL('./bookings.js', import.meta.url), 'utf8'), context);
  window.AdminBookingsFeature.renderManagement({
    bookings: [{ id: '1', status: 'Pending', attractionName: 'Falls', travelerName: 'Guest' }],
    guides: []
  });
  const html = elements.get('management-new-list').innerHTML;
  assert.match(html, /Falls/);
  assert.doesNotMatch(html, /data-management-approve|data-management-assign|data-management-guide/);
});
