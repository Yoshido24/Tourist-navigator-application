import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('guide login uses a six-digit email code instead of a password', () => {
  const html = readFileSync(new URL('../../../apps/mobile/guide-login.html', import.meta.url), 'utf8');
  assert.match(html, /id="guide-auth-otp-group"[^>]*hidden[\s\S]*?id="guide-auth-code"[^>]*inputmode="numeric"[^>]*maxlength="6"/);
  assert.match(html, /frontend\/shared\/js\/email-otp-login\.js/);
  assert.doesNotMatch(html, /id="guide-auth-password"/);
});

test('guide role is checked after OTP and pending guides are signed out', async () => {
  let setupOptions;
  let start;
  let signedOut = false;
  const message = { hidden: true, textContent: '', classList: { toggle() {} } };
  const elements = {
    'guide-auth-login-form': {},
    'guide-auth-email': { value: 'guide@example.com' },
    'guide-auth-otp-group': {},
    'guide-auth-code': {},
    'guide-auth-login-submit': {},
    'guide-auth-change-email': {},
    'guide-auth-login-message': message
  };
  const context = vm.createContext({
    window: {
      EmailOtpLogin: { setup(options) { setupOptions = options; } },
      alert() {},
      prompt: () => null,
      location: { href: '' }
    },
    document: {
      getElementById: (id) => elements[id],
      addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') start = handler; }
    },
    supabaseClient: {
      auth: {
        signOut: async () => { signedOut = true; },
        onAuthStateChange() {},
        resetPasswordForEmail: async () => ({})
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'guide-1', status: 'Pending' }, error: null })
          })
        })
      })
    }
  });
  vm.runInContext(readFileSync(new URL('./guide-login.js', import.meta.url), 'utf8'), context);
  start();
  await setupOptions.onVerified({ user: { id: 'guide-auth-user' } });
  assert.equal(signedOut, true);
  assert.match(message.textContent, /pending Admin approval/i);
});
