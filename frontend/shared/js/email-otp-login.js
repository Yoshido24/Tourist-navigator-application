function emailOtpMessage(error, phase) {
  const text = String(error?.message || error || '');
  if (error?.status === 429 || /rate limit|too many/i.test(text)) {
    return 'Too many email requests were made. Wait a few minutes, then try again.';
  }
  if (/expired|invalid token|incorrect/i.test(text)) {
    return 'That code is incorrect or has expired. Request a new code and try again.';
  }
  if (/network|fetch|failed to send/i.test(text)) {
    return 'The verification email could not be sent. Check your connection and try again.';
  }
  if (phase === 'verify') return 'The code could not be verified. Check it and try again.';
  return 'The verification email could not be sent. Contact the Tourism Office if this continues.';
}

function setEmailOtpMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle('error-message', Boolean(isError));
  element.hidden = !text;
}

function setupEmailOtpLogin({
  client,
  form,
  emailInput,
  codeGroup,
  codeInput,
  submitButton,
  resetButton,
  message,
  onVerified
}) {
  if (!client || !form || !emailInput || !codeGroup || !codeInput || !submitButton || !message) {
    throw new Error('Email verification controls are incomplete.');
  }

  let challengeEmail = '';
  let busy = false;
  const reset = () => {
    challengeEmail = '';
    codeInput.value = '';
    codeGroup.hidden = true;
    emailInput.disabled = false;
    submitButton.textContent = 'Send verification code';
    if (resetButton) resetButton.hidden = true;
    setEmailOtpMessage(message, '', false);
    emailInput.focus();
  };

  resetButton?.addEventListener('click', reset);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    setEmailOtpMessage(message, '', false);
    busy = true;
    submitButton.disabled = true;
    try {
      if (!challengeEmail) {
        const email = emailInput.value.trim().toLowerCase();
        if (!email || !emailInput.value.includes('@')) {
          setEmailOtpMessage(message, 'Enter a valid email address.', true);
          emailInput.focus();
          return;
        }
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false }
        });
        if (error) {
          setEmailOtpMessage(message, emailOtpMessage(error, 'send'), true);
          return;
        }
        challengeEmail = email;
        emailInput.disabled = true;
        codeGroup.hidden = false;
        submitButton.textContent = 'Verify code';
        if (resetButton) resetButton.hidden = false;
        setEmailOtpMessage(message, 'A six-digit verification code was sent to your email.', false);
        codeInput.focus();
        return;
      }

      const token = codeInput.value.trim();
      if (!/^\d{6}$/.test(token)) {
        setEmailOtpMessage(message, 'Enter the six-digit code from your email.', true);
        codeInput.focus();
        return;
      }
      const { data, error } = await client.auth.verifyOtp({
        email: challengeEmail,
        token,
        type: 'email'
      });
      if (error) {
        setEmailOtpMessage(message, emailOtpMessage(error, 'verify'), true);
        return;
      }
      if (!data?.session) {
        setEmailOtpMessage(message, 'The code was verified, but no login session was created. Try again.', true);
        return;
      }
      await onVerified(data.session);
    } catch (error) {
      setEmailOtpMessage(message, error?.message || String(error), true);
    } finally {
      busy = false;
      submitButton.disabled = false;
    }
  });

  return { reset };
}

window.EmailOtpLogin = { setup: setupEmailOtpLogin };
