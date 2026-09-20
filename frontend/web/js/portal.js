
// Tourist display helpers
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

function getAttractionPopup(attraction, coords) {
  const trail = attraction.trail || attraction.route;
  return `
    <article class="map-popup">
      <h3>${escapeHtml(attraction.name)}</h3>
      <p>${escapeHtml(attraction.description || 'Explore this attraction.')}</p>
      <p><strong>Fee:</strong> ${escapeHtml(attraction.fee || 'Contact admin')}</p>
      ${trail ? `<p><strong>Trail or route:</strong> ${escapeHtml(trail)}</p>` : ''}
    </article>
  `;
}

// Attraction list, selected attraction details, directions, and transport
function renderUserPage(state) {
  const attractionsList = document.getElementById('attraction-selector');
  const selectedName = document.getElementById('selected-attraction-name');
  const selectedDescription = document.getElementById('selected-attraction-description');
  const selectedExpectations = document.getElementById('selected-attraction-expectations');
  const selectedTerrain = document.getElementById('selected-attraction-terrain');
  const selectedStartPoint = document.getElementById('selected-attraction-startpoint');
  const selectedTrail = document.getElementById('selected-attraction-trail');
  const gallery = document.getElementById('attraction-gallery');
  const directionsSummary = document.getElementById('directions-summary');
  const directionsMap = document.getElementById('directions-map');
  const transportOptions = document.getElementById('transport-options');
  const directionsActions = document.getElementById('directions-actions');
  const placeSelect = document.getElementById('place');

  if (attractionsList) {
    attractionsList.innerHTML = '';
    state.attractions.forEach((attraction) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'attraction-option';
      button.innerHTML = `
        <span>${attraction.name}</span>
        <strong>${attraction.fee}</strong>
      `;
      button.addEventListener('click', () => {
        renderAttractionDetails(attraction);
      });
      attractionsList.appendChild(button);
    });
  }

  if (placeSelect) {
    const previousSelection = selectedUserAttractionId || placeSelect.value;
    placeSelect.innerHTML = '';
    state.attractions.forEach((attraction) => {
      const option = document.createElement('option');
      option.value = attraction.id;
      option.textContent = attraction.name;
      placeSelect.appendChild(option);
    });
    placeSelect.value = state.attractions.some((item) => item.id === previousSelection)
      ? previousSelection
      : '';
    placeSelect.addEventListener('change', () => {
      const attraction = state.attractions.find((item) => item.id === placeSelect.value);
      if (attraction) renderAttractionDetails(attraction);
    });
  }

  if (selectedName) selectedName.textContent = 'Select an attraction';
  if (selectedDescription) selectedDescription.textContent = 'Choose a pin on the map or an attraction from the list to see its details.';
  if (selectedExpectations) selectedExpectations.textContent = 'Waiting for an attraction selection.';
  if (selectedTerrain) selectedTerrain.textContent = 'Waiting for an attraction selection.';
  if (selectedStartPoint) selectedStartPoint.textContent = 'Waiting for an attraction selection.';
  if (selectedTrail) selectedTrail.textContent = 'Waiting for an attraction selection.';
  if (gallery) gallery.innerHTML = '';
  if (directionsSummary) directionsSummary.textContent = 'Select an attraction to load its route and public transport details.';
  if (directionsMap) {
    directionsMap.removeAttribute('src');
    directionsMap.hidden = true;
  }
  if (transportOptions) transportOptions.innerHTML = '<p class="muted">Select an attraction to see available public transport.</p>';
  if (directionsActions) directionsActions.innerHTML = '';

  const preservedAttraction = state.attractions.find((item) => item.id === selectedUserAttractionId);
  if (preservedAttraction) {
    renderAttractionDetails(preservedAttraction);
  }

  function renderAttractionDetails(attraction) {
    if (selectedName) {
      selectedName.textContent = attraction.name;
    }
    if (selectedDescription) {
      selectedDescription.textContent = attraction.description;
    }
    if (selectedExpectations) {
      selectedExpectations.textContent = attraction.expectations || 'A smooth, guided experience with friendly staff.';
    }
    if (selectedTerrain) {
      selectedTerrain.textContent = attraction.terrain || 'Easy walking with support available.';
    }
    if (selectedStartPoint) {
      selectedStartPoint.textContent = attraction.startPoint || 'Please contact the team for meetup details.';
    }
    if (selectedTrail) {
      selectedTrail.textContent = attraction.trail || attraction.route || 'Route details will be confirmed by the attraction team.';
    }

    if (gallery) {
      gallery.innerHTML = '';
      (attraction.images || []).forEach((imageUrl) => {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = attraction.name;
        gallery.appendChild(img);
      });
    }

    if (directionsSummary) {
      const routeDetails = attraction.trail || attraction.route || 'Route details will be confirmed by the attraction team.';
      directionsSummary.innerHTML = `<strong>${escapeHtml(attraction.name)}</strong>: ${escapeHtml(attraction.startPoint || 'Meet at the designated starting point.')}<br><span class="route-details"><strong>Trail or route:</strong> ${escapeHtml(routeDetails)}</span>`;
    }
    if (directionsMap) {
      const [lat, lng] = getAttractionCoords(attraction);
      directionsMap.src = attraction.directions || `https://www.google.com/maps?q=${lat},${lng}&output=embed`;
      directionsMap.hidden = false;
    }
    if (transportOptions) {
      const rawOptions = attraction.transportOptions || attraction.transport_options || attraction.publicTransport || [];
      const options = Array.isArray(rawOptions)
        ? rawOptions
        : (() => {
          try { return JSON.parse(rawOptions); } catch { return []; }
        })();
      transportOptions.innerHTML = options.length
        ? options.map((option) => `<article class="transport-option"><div class="transport-option-heading"><h4>${escapeHtml(option.mode || 'Public transport')}</h4><strong>${escapeHtml(option.fare || 'Fare not provided')}</strong></div><p>${escapeHtml(option.route || 'Route details not provided.')}</p>${option.time ? `<small>Estimated time: ${escapeHtml(option.time)}</small>` : ''}</article>`).join('')
        : '<p class="muted">No public transport details have been added for this attraction yet.</p>';
    }
    if (directionsActions) {
      const [lat, lng] = getAttractionCoords(attraction);
      directionsActions.innerHTML = `<a class="btn btn-secondary" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}">Open directions</a><a class="btn btn-secondary" target="_blank" rel="noopener" href="https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes">Open Waze</a>`;
    }

    if (placeSelect) {
      placeSelect.value = attraction.id;
      selectedUserAttractionId = attraction.id;
    }

    document.querySelectorAll('.attraction-option').forEach((button) => {
      button.classList.toggle('active', button.textContent.includes(attraction.name));
    });
  }
}

// Tourist map and attraction pin selection
function initMap(state) {
  const mapElement = document.getElementById('tourist-map');
  const detailsElement = document.getElementById('tourist-map-details');
  if (!mapElement || typeof window.L === 'undefined') return;
  if (touristMapInstance) {
    touristMapInstance.remove();
    touristMapInstance = null;
  }
  mapElement.innerHTML = '';
  if (!state.attractions.length) {
    if (detailsElement) detailsElement.innerHTML = '<p>No attractions have been published yet. Please check back soon.</p>';
    return;
  }
  if (detailsElement) {
    detailsElement.innerHTML = '<p class="map-loading">Loading attraction pins. Select a pin when the map is ready.</p>';
  }

  const firstCoords = getAttractionCoords(state.attractions[0]);
  const mapCanvas = document.createElement('div');
  mapCanvas.className = 'leaflet-map';
  mapCanvas.id = 'tourist-map-canvas';
  mapElement.appendChild(mapCanvas);
  const map = window.L.map(mapCanvas.id, { zoomControl: true, scrollWheelZoom: true })
    .setView(firstCoords, 13);
  touristMapInstance = map;
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const bounds = [];
  state.attractions.forEach((attraction) => {
    const coords = getAttractionCoords(attraction);
    bounds.push(coords);
    const marker = window.L.marker(coords).addTo(map);
    marker.bindTooltip(attraction.name);
    marker.bindPopup(getAttractionPopup(attraction, coords));
    marker.on('click', () => selectAttraction(attraction, marker));
  });
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });

  const pinPanel = document.createElement('div');
  pinPanel.className = 'map-pin-panel';
  pinPanel.innerHTML = '<strong class="map-pin-panel-title">All attraction pins</strong>';
  state.attractions.forEach((attraction) => {
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'map-pin-button';
    pin.setAttribute('aria-label', `Show ${attraction.name} on the map`);
    pin.innerHTML = `<span class="map-pin-icon" aria-hidden="true">📍</span><span>${escapeHtml(attraction.name)}</span>`;
    pin.addEventListener('click', () => selectAttraction(attraction));
    pinPanel.appendChild(pin);
  });
  mapElement.appendChild(pinPanel);
  if (detailsElement) {
    detailsElement.innerHTML = '<p>Select an attraction pin to view its details.</p>';
  }

  function selectAttraction(attraction, marker = null) {
    const coords = getAttractionCoords(attraction);
    map.setView(coords, 16);
    marker?.openPopup();
    mapElement.querySelectorAll('.map-pin-button').forEach((button) => {
      button.classList.toggle('active', button.textContent.includes(attraction.name));
    });
    if (detailsElement) {
      detailsElement.innerHTML = `
        ${getAttractionPopup(attraction, coords)}
        <p class="map-pin-note">Pinned location: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}</p>
        <button class="btn btn-secondary map-view-more" type="button">View more</button>
      `;
      detailsElement.querySelector('.map-view-more')?.addEventListener('click', () => {
        showUserTab('user-attractions');
        document.getElementById('selected-attraction-name')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    const placeSelect = document.getElementById('place');
    if (placeSelect) {
      placeSelect.value = attraction.id;
      placeSelect.dispatchEvent(new Event('change'));
    }
  }

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
}
// Booking submission and Mini Shop rendering
function setupUserForms(state) {
  window.UserBookingFeature?.setup(state);
  window.UserShopFeature?.render(state);
}

// Tourist portal startup
async function renderApp(state) {
  renderUserPage(state);
  setupUserForms(state);
  setupUserTabs();
  initMap(state);
}

document.addEventListener('DOMContentLoaded', async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
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
