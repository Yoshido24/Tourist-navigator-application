let guideAuthState = null;

function normalizeGuideAuthContact(value) {
  return String(value || '').replace(/\D/g, '');
}

function setupGuideLoginForm() {
  const loginForm = document.getElementById('guide-auth-login-form');
  loginForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const contact = normalizeGuideAuthContact(document.getElementById('guide-auth-contact').value);
    const password = document.getElementById('guide-auth-password').value.trim();
    const guides = guideAuthState?.guides || [];
    const matchingContact = guides.find((item) => normalizeGuideAuthContact(item.contact) === contact);
    const guide = matchingContact && matchingContact.password === password ? matchingContact : null;
    const message = document.getElementById('guide-auth-login-message');
    if (!guide) {
      message.textContent = matchingContact
        ? 'Login failed. Incorrect password.'
        : 'Login failed. Your application must be approved first.';
      message.hidden = false;
      return;
    }
    window.localStorage.setItem('montalban-guide-session', contact);
    window.location.href = 'guide.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  guideAuthState = await loadState();
  setupGuideLoginForm();
});
