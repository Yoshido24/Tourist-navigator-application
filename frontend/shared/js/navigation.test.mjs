import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('resort mobile navigation opens, closes after selection and restores focus on Escape', () => {
  const handlers = {};
  const nav = {
    id: 'existing-navigation',
    classList: { toggle(name, value) { nav.open = value; } },
    addEventListener(name, callback) { handlers[`nav-${name}`] = callback; },
    contains: () => true
  };
  const button = {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    getAttribute(name) { return this.attributes[name]; },
    addEventListener(name, callback) { handlers[`button-${name}`] = callback; },
    focus() { this.focused = true; }
  };
  const media = { matches: true, addEventListener(name, callback) { handlers.resize = callback; } };
  const classes = new Set(['resort-manager-portal']);
  const document = {
    body: { classList: { contains: (name) => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name), add: (name) => classes.add(name) } },
    querySelector: () => nav,
    createElement: () => button,
    addEventListener(name, callback) { handlers[`document-${name}`] = callback; }
  };
  nav.parentElement = { insertBefore() {} };
  const window = { matchMedia: () => media };
  vm.runInNewContext(readFileSync(new URL('./navigation.js', import.meta.url), 'utf8'), { document, window });
  assert.equal(classes.has('navigation-enhanced'), false);
  assert.notEqual(nav.inert, true);
  window.setDashboardNavigation(true);
  assert.equal(classes.has('navigation-enhanced'), true);
  assert.equal(nav.inert, true);
  assert.equal(button.attributes['aria-expanded'], 'false');
  handlers['button-click']();
  assert.equal(nav.inert, false);
  assert.equal(button.attributes['aria-expanded'], 'true');
  handlers['nav-click']({ target: { closest: () => ({}) } });
  assert.equal(nav.inert, true);
  handlers['button-click']();
  handlers['document-keydown']({ key: 'Escape' });
  assert.equal(nav.inert, true);
  assert.equal(button.focused, true);
  media.matches = false;
  handlers.resize();
  assert.equal(nav.inert, false);
  window.setDashboardNavigation(false);
  assert.equal(classes.has('navigation-enhanced'), false);
});

test('admin navigation remains available without a drawer on mobile', () => {
  for (const role of ['admin-desktop-only', 'barangay-admin-portal']) {
    const classes = new Set([role]);
    const nav = {};
    const document = {
      body: { classList: { contains: (name) => classes.has(name), add: (name) => classes.add(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) } },
      querySelector: () => nav,
      querySelectorAll: () => [],
      createElement() { throw new Error('Admin navigation must not create a drawer toggle'); }
    };
    const window = {};
    vm.runInNewContext(readFileSync(new URL('./navigation.js', import.meta.url), 'utf8'), { document, window });
    assert.equal(classes.has('navigation-enhanced'), false);
    window.setDashboardNavigation(true);
    assert.equal(classes.has('navigation-enhanced'), true);
    assert.notEqual(nav.inert, true);
    window.setDashboardNavigation(false);
    assert.equal(classes.has('navigation-enhanced'), false);
  }
});

test('barangay tabs update the selected button and visible panel', () => {
  const handlers = {};
  const tabs = ['add-attraction', 'bookings', 'resorts'].map((name) => ({
    dataset: { barangayTab: name },
    classList: { toggle(className, enabled) { this[className] = enabled; } },
    setAttribute(name, value) { this[name] = value; },
    addEventListener(name, handler) { handlers[`${name}-${this.dataset.barangayTab}`] = handler; }
  }));
  const panels = ['add-attraction', 'bookings', 'resorts'].map((name) => ({
    id: `barangay-${name}`,
    dataset: { barangayTabPanel: name },
    hidden: name !== 'add-attraction'
  }));
  const nav = { classList: { toggle() {} } };
  const document = {
    body: {
      classList: {
        contains: (name) => name === 'barangay-admin-portal',
        toggle() {}
      }
    },
    querySelector: () => nav,
    querySelectorAll(selector) {
      if (selector === '[data-barangay-tab]') return tabs;
      if (selector === '[data-barangay-tab-panel]') return panels;
      return [];
    }
  };
  const window = {};
  vm.runInNewContext(readFileSync(new URL('./navigation.js', import.meta.url), 'utf8'), { document, window });

  assert.equal(typeof handlers['click-bookings'], 'function');
  handlers['click-bookings']();

  assert.equal(tabs[0].classList['is-active'], false);
  assert.equal(tabs[1].classList['is-active'], true);
  assert.equal(tabs[1]['aria-selected'], 'true');
  assert.equal(panels[0].hidden, true);
  assert.equal(panels[1].hidden, false);
});

test('does not replace navigation on other pages', () => {
  const document = {
    body: { classList: { contains: () => false } },
    querySelector() { throw new Error('Portal navigation must remain untouched'); }
  };
  vm.runInNewContext(readFileSync(new URL('./navigation.js', import.meta.url), 'utf8'), { document });
});
