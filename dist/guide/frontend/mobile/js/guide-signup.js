function setupGuideSignupForm() {
  const applicationForm = document.getElementById('guide-auth-application-form');
  applicationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('guide-auth-application-message');
    const submitButton = applicationForm.querySelector('[type="submit"]');
    const showMessage = (text, isError) => {
      message.textContent = text;
      message.classList.toggle('error-message', Boolean(isError));
      message.hidden = false;
    };

    const data = new FormData(applicationForm);
    const password = String(data.get('password') || '');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      showMessage('Use a password with at least 8 characters, including letters and numbers.', true);
      return;
    }
    if (password !== data.get('confirmPassword')) {
      showMessage('Passwords do not match.', true);
      return;
    }
    if (!data.get('terms')) {
      showMessage('You must accept the Terms, Privacy Notice and Guide Code of Conduct.', true);
      return;
    }
    if (!supabaseClient) {
      showMessage('The service is not configured. Please contact the Tourism Office.', true);
      return;
    }

    submitButton.disabled = true;
    const { error } = await supabaseClient.auth.signUp({
      email: String(data.get('email') || '').trim(),
      password,
      options: {
        emailRedirectTo: new URL('guide-login.html', window.location.href).href,
        data: {
          account_type: 'guide',
          terms_accepted: 'true',
          name: data.get('name'),
          specialty: data.get('specialty'),
          contact: data.get('contact'),
          address: data.get('address'),
          idNumber: data.get('idNumber'),
          experience: data.get('experience'),
          availability: data.get('availability'),
          interviewDate: data.get('interviewDate'),
          interviewTime: data.get('interviewTime')
        }
      }
    });
    submitButton.disabled = false;

    if (error) {
      showMessage(error.message || 'Sign up failed. Please try again.', true);
      return;
    }
    applicationForm.reset();
    showMessage('Application submitted. Confirm your email using the link we sent, then wait for Admin approval before logging in.', false);
  });
}

document.addEventListener('DOMContentLoaded', setupGuideSignupForm);
