import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const helperPath = path.join(process.cwd(), 'frontend', 'shared', 'js', 'email-otp-login.js');

function element() {
  const handlers = {};
  return {
    value: '',
    textContent: '',
    hidden: true,
    disabled: false,
    classList: { toggle() {} },
    focus() { this.focused = true; },
    addEventListener(event, handler) { handlers[event] = handler; },
    dispatch(event) { return handlers[event]?.({ preventDefault() {} }); }
  };
}

function setupHarness({ sendError = null, verifyError = null } = {}) {
  const sent = [];
  const verified = [];
  const sessions = [{ user: { id: 'staff' } }];
  const client = {
    auth: {
      signInWithOtp: async (request) => { sent.push(request); return { data: {}, error: sendError }; },
      verifyOtp: async (request) => { verified.push(request); return { data: verifyError ? null : { session: sessions[0] }, error: verifyError }; }
    }
  };
  const form = element();
  const emailInput = element();
  const codeGroup = element();
  const codeInput = element();
  const submitButton = element();
  const resetButton = element();
  const message = element();
  const onVerified = [];
  const window = {};
  const context = vm.createContext({ window, console, setTimeout });
  vm.runInContext(readFileSync(helperPath, 'utf8'), context);
  window.EmailOtpLogin.setup({
    client, form, emailInput, codeGroup, codeInput, submitButton, resetButton, message,
    onVerified: async (session) => onVerified.push(session)
  });
  return {
    client, sent, verified, form, emailInput, codeGroup, codeInput, submitButton,
    resetButton, message, onVerified, sessions
  };
}

test('OTP login sends to an existing account without creating one', async () => {
  const harness = setupHarness();
  harness.emailInput.value = ' Staff@Example.com ';
  await harness.form.dispatch('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.sent)), [{
    email: 'staff@example.com',
    options: { shouldCreateUser: false }
  }]);
  assert.equal(harness.codeGroup.hidden, false);
  assert.equal(harness.emailInput.disabled, true);
  assert.equal(harness.submitButton.textContent, 'Verify code');
  assert.equal(harness.onVerified.length, 0);
});

test('OTP login verifies six digits before opening the verified callback', async () => {
  const harness = setupHarness();
  harness.emailInput.value = 'guide@example.com';
  await harness.form.dispatch('submit');
  harness.codeInput.value = '123456';
  await harness.form.dispatch('submit');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.verified)), [{
    email: 'guide@example.com',
    token: '123456',
    type: 'email'
  }]);
  assert.equal(harness.onVerified.length, 1);
  assert.equal(harness.onVerified[0].user.id, 'staff');
});

test('OTP login rejects an incomplete code before verification', async () => {
  const harness = setupHarness();
  harness.emailInput.value = 'guide@example.com';
  await harness.form.dispatch('submit');
  harness.codeInput.value = '123';
  await harness.form.dispatch('submit');
  assert.equal(harness.verified.length, 0);
  assert.match(harness.message.textContent, /six-digit/i);
});

test('OTP login keeps the user on the form for delivery and verification failures', async () => {
  const delivery = setupHarness({ sendError: { status: 429, message: 'Email rate limit exceeded' } });
  delivery.emailInput.value = 'owner@example.com';
  await delivery.form.dispatch('submit');
  assert.match(delivery.message.textContent, /wait.*try again/i);
  assert.equal(delivery.codeGroup.hidden, true);

  const verification = setupHarness({ verifyError: { message: 'Token has expired or is invalid' } });
  verification.emailInput.value = 'admin@example.com';
  await verification.form.dispatch('submit');
  verification.codeInput.value = '654321';
  await verification.form.dispatch('submit');
  assert.match(verification.message.textContent, /expired|incorrect/i);
  assert.equal(verification.onVerified.length, 0);
});

test('changing email returns to the request-code state', async () => {
  const harness = setupHarness();
  harness.emailInput.value = 'guide@example.com';
  await harness.form.dispatch('submit');
  harness.codeInput.value = '123456';
  harness.resetButton.dispatch('click');
  assert.equal(harness.codeGroup.hidden, true);
  assert.equal(harness.emailInput.disabled, false);
  assert.equal(harness.codeInput.value, '');
  assert.equal(harness.submitButton.textContent, 'Send verification code');
});
