
// Guide display helpers
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAttractionCoords(attraction) {
  if (Array.isArray(attraction.coords) && attraction.coords.length === 2) {
    return attraction.coords;
  }

  if (attraction.position && typeof attraction.position.x === 'number' && typeof attraction.position.y === 'number') {
    const lat = 14.73 + (attraction.position.y / 100) * 0.03;
    const lng = 121.15 + (attraction.position.x / 100) * 0.05;
    return [lat, lng];
  }

  return [14.73, 121.15];
}

// Guide overview, assigned bookings, schedule, and visitor list
let signedInGuideContact = '';

function normalizeGuideContact(value) {
  return String(value || '').replace(/\D/g, '');
}

function renderGuidePage(state) {
  if (!signedInGuideContact) {
    signedInGuideContact = normalizeGuideContact(window.localStorage.getItem('montalban-guide-session') || '');
  }
  const approvedGuides = state.guides.filter((guide) => guide.status !== 'Pending');
  const currentGuide = approvedGuides.find((guide) => normalizeGuideContact(guide.contact) === signedInGuideContact)?.name || '';
  const overview = document.getElementById('guide-overview-summary');
  if (overview) {
    const assignedBookings = state.bookings.filter((booking) => currentGuide && booking.assignedGuide === currentGuide && booking.status !== 'Completed');
    overview.textContent = assignedBookings.length
      ? `${assignedBookings.length} assigned tour${assignedBookings.length === 1 ? '' : 's'} scheduled.`
      : 'No tours scheduled yet.';
  }

  const guideInfoList = document.getElementById('guide-info-list');
  if (guideInfoList) {
    guideInfoList.innerHTML = '';
    approvedGuides.filter((guide) => !currentGuide || guide.name === currentGuide).forEach((guide) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${guide.name}</h3>
        <p><strong>Specialty:</strong> ${guide.specialty}</p>
        <p><strong>Contact:</strong> ${guide.contact}</p>
        <p><strong>Availability:</strong> ${guide.availability}</p>
      `;
      guideInfoList.appendChild(card);
    });
  }

  const bookingList = document.getElementById('guide-bookings-list');
  if (bookingList) {
    bookingList.innerHTML = '';
    const assignedBookings = state.bookings.filter((booking) => currentGuide && booking.assignedGuide === currentGuide && booking.status === 'Completed');
    assignedBookings.forEach((booking) => {
      const attraction = state.attractions.find((item) => item.id === booking.attractionId);
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${booking.attractionName}</h3>
        <p><strong>Traveler:</strong> ${booking.travelerName}</p>
        <p><strong>Contact:</strong> ${booking.contact || 'Not provided'}</p>
        <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
        <p><strong>Meeting point:</strong> ${booking.meetingPoint || attraction?.startPoint || 'To be confirmed'}</p>
        ${attraction?.transportOptions?.length ? `<p><strong>Getting there:</strong> ${attraction.transportOptions.map((option) => `${option.mode}: ${option.fare}`).join(' • ')}</p>` : ''}
        <p>${booking.notes}</p>
        ${booking.status !== 'Completed' ? `<div class="filter-row">
          <button class="btn btn-secondary" type="button" data-booking-status="Confirmed">Confirm</button>
          <button class="btn btn-primary" type="button" data-booking-status="Completed">Complete</button>
        </div>` : ''}
      `;
      card.querySelector('[data-booking-status="Confirmed"]')?.addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (item.id === booking.id ? { ...item, status: 'Confirmed' } : item))
        }));
      });
      card.querySelector('[data-booking-status="Completed"]')?.addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (item.id === booking.id ? { ...item, status: 'Completed' } : item))
        }));
      });
      bookingList.appendChild(card);
    });
  }

  const scheduleList = document.getElementById('guide-schedule-list');
  if (scheduleList) {
    const scheduledBookings = state.bookings
      .filter((booking) => currentGuide && booking.assignedGuide === currentGuide && booking.status !== 'Completed')
      .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
    scheduleList.innerHTML = '';
    if (!scheduledBookings.length) {
      scheduleList.innerHTML = '<p>No assigned tours have been scheduled yet.</p>';
    }
    scheduledBookings.forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `<h3>${escapeHtml(booking.date)}${booking.time ? ` at ${escapeHtml(booking.time)}` : ''}</h3>
        <p><strong>Attraction:</strong> ${escapeHtml(booking.attractionName || '')}</p>
        <p><strong>Traveler:</strong> ${escapeHtml(booking.travelerName || '')}</p>
        <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
        <p><strong>Meeting point:</strong> ${escapeHtml(booking.meetingPoint || 'To be confirmed')}</p>
        <p>${escapeHtml(booking.scheduleNotes || '')}</p>
        <button class="btn btn-primary" type="button" data-schedule-complete>Complete tour</button>`;
      card.querySelector('[data-schedule-complete]').addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => item.id === booking.id ? { ...item, status: 'Completed' } : item)
        }));
      });
      scheduleList.appendChild(card);
    });
  }

  const visitorList = document.getElementById('guide-visitors-list');
  if (visitorList) {
    visitorList.innerHTML = '';
    state.bookings.filter((booking) => currentGuide && booking.assignedGuide === currentGuide && booking.status !== 'Completed').slice(0, 3).forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${booking.travelerName}</h3>
        <p>${booking.attractionName}</p>
        <p>${booking.date}</p>
        <p>${booking.status}</p>
      `;
      visitorList.appendChild(card);
    });
  }

}

// Guide tab navigation and portal startup
function setupGuideApplication() {
  const form = document.getElementById('guide-application-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    await updateState((currentState) => ({
      ...currentState,
      guideApplications: [{
        id: `guide-application-${Date.now()}`,
        name: data.get('name') || '',
        specialty: data.get('specialty') || '',
        contact: data.get('contact') || '',
        email: data.get('email') || '',
        password: data.get('password') || '',
        availability: data.get('availability') || '',
        status: 'Pending'
      }, ...(currentState.guideApplications || [])]
    }));
    form.reset();
    const message = document.getElementById('guide-application-message');
    if (message) {
      message.textContent = 'Application submitted. Admin approval is required before you can receive bookings.';
      message.hidden = false;
    }

  });
}

function setupGuideLogin() {
  const form = document.getElementById('guide-login-form');
  if (!form || form.dataset.bound === 'true') return;
  form.dataset.bound = 'true';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const contact = normalizeGuideContact(document.getElementById('guide-login-contact').value);
    const password = document.getElementById('guide-login-password').value;
    const guide = (appState?.guides || []).find((item) => normalizeGuideContact(item.contact) === contact && item.password === password);
    const message = document.getElementById('guide-login-message');
    if (!guide) {
      message.textContent = 'Login failed. Use the approved contact number and password.';
      message.hidden = false;
      return;
    }
    signedInGuideContact = contact;
    message.textContent = `Logged in as ${guide.name}.`;
    message.hidden = false;
    window.localStorage.setItem('montalban-guide-session', contact);
    renderGuidePage(appState);
    document.querySelector('[data-guide-tab="guide-schedule"]')?.click();
  });
}

async function renderApp(state) {
  renderGuidePage(state);
}

function setupGuideTabs() {
  const showTab = (target) => {
    const activeTab = document.querySelector(`[data-guide-tab="${target}"]`);
    document.querySelectorAll('.guide-tab').forEach((item) => {
        item.classList.toggle('is-active', item === activeTab);
      item.setAttribute('aria-selected', item === activeTab ? 'true' : 'false');
    });
    document.querySelectorAll('.guide-tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== target;
    });
  };

  document.querySelectorAll('.guide-tab').forEach((tab) => {
    tab.addEventListener('click', () => showTab(tab.dataset.guideTab));
  });
  document.querySelectorAll('[data-guide-tab-target]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.guideTabTarget));
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!window.localStorage.getItem('montalban-guide-session')) {
    window.location.replace('guide-auth.html');
    return;
  }
  const year = document.getElementById('year');
  if (year) {
    year.textContent = new Date().getFullYear();
  }
  setupGuideTabs();
  setupGuideApplication();
  setupGuideLogin();
  appState = await loadState();
  await renderApp(appState);
});
