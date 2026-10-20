
// Tourist display helpers shared by every feature module
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

  if (attraction.position) {
    const position = typeof attraction.position === 'string'
      ? (() => {
        try { return JSON.parse(attraction.position); } catch { return null; }
      })()
      : attraction.position;
    const lat = Number(position?.lat ?? position?.latitude);
    const lng = Number(position?.lng ?? position?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    if (Number.isFinite(Number(position?.x)) && Number.isFinite(Number(position?.y))) {
      return [14.73 + (Number(position.y) / 100) * 0.03, 121.15 + (Number(position.x) / 100) * 0.05];
    }
  }

  return [14.73, 121.15];
}

function showUserTab(target) {
  const tab = document.querySelector(`[data-user-tab="${target}"]`);
  document.querySelectorAll('[data-user-tab]').forEach((item) => {
    item.classList.toggle('is-active', item === tab);
    item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
  });
  document.querySelectorAll('.user-tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== target;
  });
}

function setupImageLightbox() {
  const lightbox = document.getElementById('image-lightbox');
  const image = document.getElementById('image-lightbox-image');
  const closeButton = document.getElementById('image-lightbox-close');
  if (!lightbox || !image || !closeButton) return;

  const close = () => {
    lightbox.hidden = true;
    image.removeAttribute('src');
  };

  window.openImageLightbox = (src, alt) => {
    image.src = src;
    image.alt = alt || '';
    lightbox.hidden = false;
    closeButton.focus();
  };

  closeButton.addEventListener('click', close);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) close();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !lightbox.hidden) close();
  });
}

// Tourist tab navigation, including buttons that jump to Booking
function setupUserTabs() {
  if (document.body.dataset.userTabsBound === 'true') {
    return;
  }
  document.body.dataset.userTabsBound = 'true';

  document.querySelectorAll('[data-user-tab]').forEach((tab) => tab.addEventListener('click', () => showUserTab(tab.dataset.userTab)));
  document.querySelectorAll('[data-user-tab-target]').forEach((button) => {
    button.addEventListener('click', () => showUserTab(button.dataset.userTabTarget));
  });

  const menuToggle = document.getElementById('user-menu-toggle');
  const navigation = document.getElementById('user-navigation');
  if (menuToggle && navigation) {
    menuToggle.addEventListener('click', () => {
      const isOpen = navigation.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
    });

    document.querySelectorAll('[data-user-tab]').forEach((tab) => tab.addEventListener('click', () => {
      navigation.classList.remove('is-open');
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Open navigation menu');
    }));
  }
}

// Tourist portal startup: delegates rendering to each feature module
async function renderApp(state) {
  window.UserAttractionsFeature?.render(state);
  window.UserBookingFeature?.setup(state);
  window.UserShopFeature?.render(state);
  setupUserTabs();
  window.UserMapFeature?.render(state);
}

document.addEventListener('DOMContentLoaded', async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  setupImageLightbox();
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

