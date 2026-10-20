
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
let signedInGuideUserId = '';

function renderGuidePage(state) {
  const approvedGuides = state.guides.filter((guide) => guide.status !== 'Pending' && guide.auth_user_id === signedInGuideUserId);
  const currentGuide = approvedGuides[0]?.name || '';
  const overview = document.getElementById('guide-overview-summary');
  if (overview) {
    const assignedBookings = state.bookings
      .filter((booking) => currentGuide && booking.assignedGuide === currentGuide && ['Assigned', 'Confirmed', 'Ongoing'].includes(booking.status))
      .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
    const completedCount = state.bookings.filter((booking) => currentGuide && booking.assignedGuide === currentGuide && booking.status === 'Completed').length;
    const nextTourName = document.getElementById('guide-next-tour-name');
    const nextTourDetails = document.getElementById('guide-next-tour-details');
    if (assignedBookings.length) {
      const next = assignedBookings[0];
      overview.textContent = `Next: ${next.attractionName || 'Tour'} on ${next.date}${next.time ? ` at ${next.time}` : ''} • ${assignedBookings.length} upcoming, ${completedCount} completed.`;
      if (nextTourName) nextTourName.textContent = next.attractionName || 'Assigned tour';
      if (nextTourDetails) nextTourDetails.textContent = `${next.date}${next.time ? ` • ${next.time}` : ''} • ${next.status || 'Assigned'}`;
    } else {
      overview.textContent = completedCount ? `No upcoming tours. ${completedCount} completed so far.` : 'No tours scheduled yet.';
      if (nextTourName) nextTourName.textContent = 'No upcoming tour';
      if (nextTourDetails) nextTourDetails.textContent = completedCount ? `${completedCount} completed tour${completedCount === 1 ? '' : 's'}` : 'Your assigned tours will appear here.';
    }
  }

  const guideInfoList = document.getElementById('guide-info-list');
  if (guideInfoList) {
    guideInfoList.innerHTML = '';
    approvedGuides.filter((guide) => !currentGuide || guide.name === currentGuide).forEach((guide) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${escapeHtml(guide.name)}</h3>
        <p><strong>Specialty:</strong> ${escapeHtml(guide.specialty)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(guide.contact)}</p>
        <p><strong>Availability:</strong> ${escapeHtml(guide.availability)}</p>
      `;
      guideInfoList.appendChild(card);
    });
  }

  window.GuideBookingsFeature?.render(state, currentGuide);
  window.GuideScheduleFeature?.render(state, currentGuide);
}

// Guide tab navigation and portal startup
async function renderApp(state) {
  renderGuidePage(state);
}

function setupGuideTabs() {
  const showTab = (target) => {
    document.querySelectorAll('[data-guide-tab]').forEach((item) => {
      const isActive = item.dataset.guideTab === target;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    document.querySelectorAll('.guide-tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== target;
    });
  };

  document.querySelectorAll('[data-guide-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      showTab(tab.dataset.guideTab);
      const dropdown = document.getElementById('guide-menu-dropdown');
      if (dropdown && !dropdown.hidden) {
        dropdown.hidden = true;
        document.getElementById('guide-menu-toggle')?.setAttribute('aria-expanded', 'false');
      }
    });
  });
  document.querySelectorAll('[data-guide-tab-target]').forEach((button) => {
    button.addEventListener('click', () => showTab(button.dataset.guideTabTarget));
  });
}

function setupGuideMenu() {
  const toggle = document.getElementById('guide-menu-toggle');
  const dropdown = document.getElementById('guide-menu-dropdown');
  if (!toggle || !dropdown) return;
  toggle.addEventListener('click', () => {
    const willOpen = dropdown.hidden;
    dropdown.hidden = !willOpen;
    toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });
  document.addEventListener('click', (event) => {
    if (dropdown.hidden) return;
    if (toggle.contains(event.target) || dropdown.contains(event.target)) return;
    dropdown.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  });
}

function setupGuideLogout() {
  const logout = async () => {
    await supabaseClient?.auth.signOut();
    signedInGuideUserId = '';
    window.location.replace('guide-auth.html');
  };
  document.getElementById('guide-logout')?.addEventListener('click', logout);
  document.getElementById('guide-settings-logout')?.addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await getAuthSession();
  if (!session || getSessionRole(session) !== 'authenticated') {
    window.location.replace('guide-auth.html');
    return;
  }
  signedInGuideUserId = session.user.id;
  const year = document.getElementById('year');
  if (year) {
    year.textContent = new Date().getFullYear();
  }
  setupGuideTabs();
  setupGuideMenu();
  setupGuideLogout();
  appState = await loadState();
  if (!appState.guides.some((guide) => guide.auth_user_id === signedInGuideUserId)) {
    await supabaseClient.auth.signOut();
    window.location.replace('guide-login.html');
    return;
  }
  await renderApp(appState);
});
