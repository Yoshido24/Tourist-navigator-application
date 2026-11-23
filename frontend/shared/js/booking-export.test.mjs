import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const helperPath = path.join(process.cwd(), 'frontend', 'shared', 'js', 'booking-export.js');

function loadHelper() {
  const window = {};
  const document = {
    createElement: () => ({ click() {}, remove() {} }),
    body: { appendChild() {} }
  };
  const context = vm.createContext({
    window,
    document,
    Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    supabaseClient: { rpc: async () => ({ data: [], error: null }) },
    console
  });
  vm.runInContext(readFileSync(helperPath, 'utf8'), context);
  return { context, window };
}

test('previous export month uses the Asia/Manila calendar', () => {
  const { context } = loadHelper();
  assert.equal(
    vm.runInContext("previousManilaMonth(new Date('2026-11-01T01:00:00Z'))", context),
    '2026-10'
  );
  assert.equal(
    vm.runInContext("previousManilaMonth(new Date('2026-01-01T00:30:00Z'))", context),
    '2025-12'
  );
});

test('CSV safely quotes and neutralizes spreadsheet formulas', () => {
  const { context } = loadHelper();
  context.rows = [{
    booking_id: '=1+1',
    booking_status: '+Pending',
    booking_date: '-danger',
    destination: '@lookup',
    traveler_name: 'Visitor, "One"',
    notes: 'Line one\nLine two'
  }];
  const csv = vm.runInContext('bookingHistoryCsv(rows)', context);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"'\+Pending"/);
  assert.match(csv, /"'-danger"/);
  assert.match(csv, /"'@lookup"/);
  assert.match(csv, /"Visitor, ""One"""/);
  assert.match(csv, /"Line one\nLine two"/);
});

test('print report escapes database values', () => {
  const { context } = loadHelper();
  context.rows = [{
    booking_id: '<script>alert(1)</script>',
    destination: '<img src=x onerror=alert(1)>'
  }];
  const html = vm.runInContext("bookingHistoryPrintHtml(rows, '2026-10')", context);
  assert.match(html, /Booking history — October 2026/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('print action reports a blocked popup instead of pretending to print', async () => {
  const { context, window } = loadHelper();
  window.open = () => null;
  await assert.rejects(
    window.BookingHistoryExport.exportPrint('2026-10', window),
    /Allow pop-ups/
  );
});
