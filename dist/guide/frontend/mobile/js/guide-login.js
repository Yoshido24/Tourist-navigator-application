function setupGuideLoginForm() {
  const loginForm = document.getElementById('guide-auth-login-form');
  const message = document.getElementById('guide-auth-login-message');
  const showMessage = (text, isError = true) => {
    message.textContent = text;
    message.classList.toggle('error-message', isError);
    message.hidden = false;
  };

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!supabaseClient) {
      showMessage('The service is not configured. Please contact the Tourism Office.');
      return;
    }
    const email = document.getElementById('guide-auth-email').value.trim();
    const password = document.getElementById('guide-auth-password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      showMessage(error?.message === 'Email not confirmed'
        ? 'Confirm your email first using the link we sent you.'
        : 'Login failed. Check your email and password.');
      return;
    }

    // Only guides that Admin approved have a row in public.guides (RLS exposes just their own).
    const { data: guide } = await supabaseClient
      .from('guides')
      .select('id')
      .eq('auth_user_id', data.user.id)
      .maybeSingle();
    if (!guide) {
      await supabaseClient.auth.signOut();
      showMessage('Your application is still pending Admin approval.');
      return;
    }
    window.location.href = 'guide.html';
  });

  document.getElementById('guide-auth-reset')?.addEventListener('click', async () => {
    const email = document.getElementById('guide-auth-email').value.trim();
    if (!email) {
      showMessage('Enter your email address first.');
      return;
    }
    await supabaseClient?.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('guide-login.html', window.location.href).href
    });
    showMessage('If that email is registered, a password reset link has been sent.', false);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupGuideLoginForm();
  supabaseClient?.auth.onAuthStateChange(async (event) => {
    if (event !== 'PASSWORD_RECOVERY') return;
    const next = window.prompt('Enter a new password (8+ characters with letters and numbers):') || '';
    if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) {
      window.alert('Password not changed. It must have 8+ characters with letters and numbers.');
      await supabaseClient.auth.signOut();
      return;
    }
    const { error } = await supabaseClient.auth.updateUser({ password: next });
    await supabaseClient.auth.signOut();
    window.alert(error ? error.message : 'Password updated. Please log in.');
  });
});
