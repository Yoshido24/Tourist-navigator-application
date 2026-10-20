
// Shared admin helpers
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAttractionCoords(attraction) {
  const savedCoords = typeof attraction.coords === 'string'
    ? (() => {
      try { return JSON.parse(attraction.coords); } catch { return null; }
    })()
    : attraction.coords;
  if (Array.isArray(savedCoords) && savedCoords.length === 2) {
    const lat = Number(savedCoords[0]);
    const lng = Number(savedCoords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return [lat, lng];
    }
  }

  const position = typeof attraction.position === 'string'
    ? (() => {
      try { return JSON.parse(attraction.position); } catch { return null; }
    })()
    : attraction.position;
  if (position) {
    const lat = Number(position.lat ?? position.latitude);
    const lng = Number(position.lng ?? position.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    if (Number.isFinite(Number(position.x)) && Number.isFinite(Number(position.y))) {
      return [14.73 + (Number(position.y) / 100) * 0.03, 121.15 + (Number(position.x) / 100) * 0.05];
    }
  }

  return [14.73, 121.15];
}

// Admin overview cards, guides, and guide applications
function renderAdminPage(state) {
  window.AdminAttractionsFeature?.renderMap(state);
  window.AdminAttractionsFeature?.renderList(state);

  const bookingCount = document.getElementById('stat-bookings');
  if (bookingCount) {
    bookingCount.textContent = state.bookings.length;
  }

  const newBookingCount = document.getElementById('stat-new-bookings');
  if (newBookingCount) {
    newBookingCount.textContent = state.bookings.filter((booking) => booking.status === 'Pending').length;
  }

  const attractionCount = document.getElementById('stat-attractions');
  if (attractionCount) {
    attractionCount.textContent = state.attractions.length;
  }

  const guideCount = document.getElementById('stat-guides');
  if (guideCount) {
    guideCount.textContent = state.guides.length;
  }

  const shopProductCount = document.getElementById('stat-shop-products');
  if (shopProductCount) {
    shopProductCount.textContent = String((state.shopProducts || []).length);
  }

  const guideList = document.getElementById('admin-guides-list');
  if (guideList) {
    guideList.innerHTML = '';
    state.guides.forEach((guide) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${escapeHtml(guide.name)}</h3>
        <p><strong>Specialty:</strong> ${escapeHtml(guide.specialty)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(guide.contact)}</p>
        <p><strong>Availability:</strong> ${escapeHtml(guide.availability)}</p>
        <button class="btn btn-secondary" type="button" data-remove-guide>Remove guide</button>
      `;
      card.querySelector('[data-remove-guide]').addEventListener('click', async () => {
        if (!window.confirm(`Remove ${guide.name} as a guide?`)) return;
        await updateState((currentState) => ({
          ...currentState,
          guides: currentState.guides.filter((item) => item.id !== guide.id)
        }));
      });
      guideList.appendChild(card);
    });
  }

  const applicationsList = document.getElementById('admin-guide-applications-list');
  if (applicationsList) {
    const applications = state.guideApplications || [];
    const pendingApplications = applications.filter((application) => (application.status || 'Pending') === 'Pending');
    applicationsList.innerHTML = pendingApplications.length
      ? ''
      : '<p class="empty-state">No pending guide applications.</p>';
    pendingApplications.forEach((application) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${escapeHtml(application.name)}</h3>
        <p><strong>Specialty:</strong> ${escapeHtml(application.specialty || 'Not provided')}</p>
        <p><strong>Contact:</strong> ${escapeHtml(application.contact || 'Not provided')}</p>
        <p><strong>Email:</strong> ${escapeHtml(application.email || 'Not provided')}</p>
        <p><strong>Address:</strong> ${escapeHtml(application.address || 'Not provided')}</p>
        <p><strong>Valid ID:</strong> ${escapeHtml(application.idNumber || 'Not provided')}</p>
        <p><strong>Experience:</strong> ${escapeHtml(application.experience || 'Not provided')}</p>
        <p><strong>Login email:</strong> ${escapeHtml(application.email || 'Not provided')}</p>
        <p><strong>Availability:</strong> ${escapeHtml(application.availability || 'Not provided')}</p>
        <p><strong>Interview:</strong> ${escapeHtml(application.interviewDate || 'Not scheduled')} ${escapeHtml(application.interviewTime || '')} at ${escapeHtml(application.interviewLocation || 'Montalban Tourism Office')}</p>
        <div class="attraction-management-actions">
          <button class="btn btn-primary" type="button" data-approve-application>Confirm interview and approve</button>
          <button class="btn btn-secondary" type="button" data-deny-application>Deny</button>
        </div>
        <p class="application-sync-warning" hidden></p>
      `;
      card.querySelector('[data-approve-application]').addEventListener('click', async () => {
        if (!window.confirm(`Confirm that ${application.name} completed the interview at the Tourism Office, then approve this guide?`)) return;
        await updateState((currentState) => ({
          ...currentState,
          guides: [{
            id: application.id,
            name: application.name,
            specialty: application.specialty || '',
            contact: application.contact || '',
            address: application.address || '',
            idNumber: application.idNumber || '',
            experience: application.experience || '',
            availability: application.availability || '',
            email: application.email || '',
            auth_user_id: application.auth_user_id || null
          }, ...currentState.guides.filter((guide) => guide.id !== application.id)],
          guideApplications: (currentState.guideApplications || []).map((item) => (
            item.id === application.id ? { ...item, status: 'Approved' } : item
          ))
        }));
        if (window.lastSyncErrors?.guides || window.lastSyncErrors?.guideApplications) {
          const warning = card.querySelector('.application-sync-warning');
          warning.textContent = 'Saved on this device only. It could not reach the shared database, so the guide may not be able to log in from another device yet.';
          warning.hidden = false;
        }
      });
      card.querySelector('[data-deny-application]').addEventListener('click', async () => {
        if (!window.confirm(`Deny ${application.name}'s application?`)) return;
        await updateState((currentState) => ({
          ...currentState,
          guideApplications: (currentState.guideApplications || []).filter((item) => item.id !== application.id)
        }));
      });
      applicationsList.appendChild(card);
    });
  }

  window.AdminShopFeature?.render(state);
  window.AdminBookingsFeature?.renderList(state);
  window.AdminBookingsFeature?.renderManagement(state);
}

// Admin tabs, modal controls, guide creation, and shop management
function setupAdminControls() {
  document.querySelectorAll('[data-admin-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.adminTab;
      document.querySelectorAll('[data-admin-tab]').forEach((item) => {
        item.classList.toggle('is-active', item === tab);
        item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
      });
      document.querySelectorAll('.admin-tab-panel').forEach((panel) => {
        panel.hidden = panel.id !== target;
      });
    });
  });

  document.querySelectorAll('[data-attraction-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.attractionView;
      document.querySelectorAll('[data-attraction-view]').forEach((item) => {
        item.classList.toggle('is-active', item === tab);
        item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
      });

      document.querySelectorAll('.attraction-view-panel').forEach((panel) => {
        panel.hidden = panel.id !== target;
      });
    });
  });

  document.querySelectorAll('[data-guide-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.guideView;
      document.querySelectorAll('[data-guide-view]').forEach((item) => {
        item.classList.toggle('is-active', item === tab);
        item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
      });

      document.querySelectorAll('.guide-view-panel').forEach((panel) => {
        panel.hidden = panel.id !== target;
      });
    });
  });

  document.querySelectorAll('[data-management-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.managementView;
      document.querySelectorAll('[data-management-view]').forEach((item) => {
        item.classList.toggle('is-active', item === tab);
        item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
      });
      document.querySelectorAll('.management-view-panel').forEach((panel) => {
        panel.hidden = panel.id !== target;
      });
    });
  });

  document.querySelectorAll('[data-shop-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.shopView;
      document.querySelectorAll('[data-shop-view]').forEach((item) => {
        item.classList.toggle('is-active', item === tab);
        item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
      });
      document.querySelectorAll('.shop-view-panel').forEach((panel) => {
        panel.hidden = panel.id !== target;
      });
    });
  });

  const openAttractions = () => {
    document.querySelector('[data-admin-tab="attractions"]')?.click();
    document.querySelector('[data-attraction-view="attraction-add-panel"]')?.click();
    document.getElementById('pin-picker-modal')?.removeAttribute('hidden');
    window.setTimeout(() => window.adminAttractionMap?.invalidateSize(), 0);
  };
  document.querySelectorAll('#open-attractions-btn, [data-open-attractions]').forEach((button) => {
    button.addEventListener('click', openAttractions);
  });
  document.querySelectorAll('#overview [data-admin-tab="attractions"]').forEach((button) => {
    button.addEventListener('click', openAttractions);
  });

  document.getElementById('new-attraction-btn')?.addEventListener('click', () => {
    document.getElementById('pin-picker-modal')?.removeAttribute('hidden');
    window.setTimeout(() => window.adminAttractionMap?.invalidateSize(), 0);
  });
  document.querySelector('[data-close-pin-picker]')?.addEventListener('click', () => {
    document.getElementById('pin-picker-modal')?.setAttribute('hidden', '');
  });
  document.getElementById('confirm-pin-location')?.addEventListener('click', () => {
    document.getElementById('pin-picker-modal')?.setAttribute('hidden', '');
    window.setTimeout(() => window.adminAttractionMap?.invalidateSize(), 0);
  });

  window.AdminShopFeature?.setup();
}

// Blocks the portal until an admin signs in; admin status comes from the JWT app_metadata set in Supabase.
async function requireAdminSession() {
  if (!supabaseClient) return true;
  const session = await getAuthSession();
  if (getSessionRole(session) === 'admin') return true;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#0f172a;padding:1rem;';
    overlay.innerHTML = `
      <form class="booking-form hero-card" style="width:min(24rem,100%);">
        <h2>Admin sign in</h2>
        <label for="admin-email">Email</label>
        <input id="admin-email" type="email" autocomplete="username" required />
        <label for="admin-password">Password</label>
        <input id="admin-password" type="password" autocomplete="current-password" required />
        <button class="btn btn-primary" type="submit">Sign in</button>
        <p class="success-message error-message" role="alert" hidden></p>
      </form>`;
    document.body.appendChild(overlay);
    const form = overlay.querySelector('form');
    const error = overlay.querySelector('.error-message');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { data, error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: overlay.querySelector('#admin-email').value.trim(),
        password: overlay.querySelector('#admin-password').value
      });
      if (signInError) {
        error.textContent = `Sign in failed: ${signInError.message}`;
        error.hidden = false;
        return;
      }
      if (getSessionRole(data?.session) !== 'admin') {
        await supabaseClient.auth.signOut();
        error.textContent = 'Signed in, but this account has no admin role. Run the SQL that sets app_metadata role = admin for this email.';
        error.hidden = false;
        return;
      }
      overlay.remove();
      resolve(true);
    });
  });
}

function setupAdminLogout() {
  const nav = document.querySelector('.topbar .admin-tabs');
  if (!nav || !supabaseClient) return;
  const button = document.createElement('button');
  button.className = 'admin-tab';
  button.type = 'button';
  button.textContent = 'Sign out';
  button.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.reload();
  });
  nav.appendChild(button);
}

async function renderApp(state) { renderAdminPage(state); }
document.addEventListener('DOMContentLoaded', async () => {
  await requireAdminSession();
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  setupAdminControls();
  setupAdminLogout();
  appState = await loadState();
  await renderApp(appState);

  let refreshTimer = null;
  const refreshWhenVisible = () => {
    if (document.hidden || refreshTimer) return;
    refreshTimer = window.setTimeout(async () => {
      refreshTimer = null;
      appState = await loadState();
      await renderApp(appState);
    }, 250);
  };
  window.addEventListener('focus', refreshWhenVisible);
  document.addEventListener('visibilitychange', refreshWhenVisible);
});
