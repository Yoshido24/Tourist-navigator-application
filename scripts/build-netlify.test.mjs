import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildNetlifySite } from './build-netlify.mjs';

test('builds a self-contained static site without publishing development files', () => {
  const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'navigator-netlify-'));
  try {
    buildNetlifySite(outputDirectory);

    for (const file of [
      'index.html',
      'user.html',
      'apps/web/index.html',
      'apps/web/user.html',
      'apps/desktop/admin.html',
      'apps/mobile/guide.html',
      'frontend/shared/js/state.js',
      'frontend/web/features/map/map.js',
      'frontend/desktop/features/announcements/announcements.js',
      'frontend/desktop/features/showcases/showcases.js',
      '_headers'
    ]) {
      assert.equal(existsSync(path.join(outputDirectory, file)), true, `${file} should be published`);
    }

    for (const file of ['android', 'backend', 'node_modules', 'supabase', '.git']) {
      assert.equal(existsSync(path.join(outputDirectory, file)), false, `${file} should not be published`);
    }
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('published portal entry points lead to the appropriate existing sign-in pages', () => {
  const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'navigator-portals-'));
  try {
    buildNetlifySite(outputDirectory);
    const landing = readFileSync(path.join(outputDirectory, 'apps', 'web', 'index.html'), 'utf8');
    assert.match(landing, /href="\.\.\/desktop\/admin-access\.html"/);
    assert.match(landing, /href="\.\.\/mobile\/partner-access\.html"/);
    const admin = readFileSync(path.join(outputDirectory, 'apps', 'desktop', 'admin-access.html'), 'utf8');
    assert.match(admin, /href="admin\.html"/);
    assert.match(admin, /href="barangay-admin\.html"/);
    const partner = readFileSync(path.join(outputDirectory, 'apps', 'mobile', 'partner-access.html'), 'utf8');
    assert.match(partner, /href="guide-auth\.html"/);
    assert.match(partner, /href="\.\.\/desktop\/resort-manager\.html"/);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test('resort owners can navigate between separate sign-in and application screens', () => {
  const outputDirectory = mkdtempSync(path.join(os.tmpdir(), 'navigator-resort-access-'));
  try {
    buildNetlifySite(outputDirectory);
    const signIn = readFileSync(path.join(outputDirectory, 'apps', 'desktop', 'resort-manager.html'), 'utf8');
    const application = readFileSync(path.join(outputDirectory, 'apps', 'desktop', 'resort-signup.html'), 'utf8');
    assert.match(signIn, /id="resort-signin"/);
    assert.doesNotMatch(signIn, /id="resort-signup"/);
    assert.match(signIn, /href="resort-signup\.html"/);
    assert.match(application, /id="resort-signup"/);
    assert.doesNotMatch(application, /id="resort-signin"/);
    assert.match(application, /href="resort-manager\.html"/);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
