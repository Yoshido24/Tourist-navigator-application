let guideAuthState = null;

function normalizeGuideAuthContact(value) {
  return String(value || '').replace(/\D/g, '');
}

function setupGuideAuth() {
  const loginForm = document.getElementById('guide-auth-login-form');
  const applicationForm = document.getElementById('guide-auth-application-form');

  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const contact = normalizeGuideAuthContact(document.getElementById('guide-auth-contact').value);
    const password = document.getElementById('guide-auth-password').value;
    const guide = (guideAuthState?.guides || []).find((item) => (
      normalizeGuideAuthContact(item.contact) === contact && item.password === password
    ));
    const message = document.getElementById('guide-auth-login-message');
    if (!guide) {
      message.textContent = 'Login failed. Your application must be approved first.';
      message.hidden = false;
      return;
    }
    window.localStorage.setItem('montalban-guide-session', contact);
    window.location.href = 'guide.html';
  });

  applicationForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(applicationForm);
    await updateState((currentState) => ({
      ...currentState,
      guideApplications: [{
        id: `guide-application-${Date.now()}`,
        name: data.get('name') || '',
        specialty: data.get('specialty') || '',
        contact: data.get('contact') || '',
        password: data.get('password') || '',
        availability: data.get('availability') || '',
        status: 'Pending'
      }, ...(currentState.guideApplications || [])]
    }));
    applicationForm.reset();
    const message = document.getElementById('guide-auth-application-message');
    message.textContent = 'Application submitted. Admin approval is required before you can log in.';
    message.hidden = false;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  guideAuthState = await loadState();
  setupGuideAuth();
});
