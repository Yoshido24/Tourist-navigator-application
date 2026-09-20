
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

// Attraction map, pin picker, transport editor, and attraction form
function renderAdminMap(state) {
  const container = document.getElementById('admin-map-view');
  if (!container || typeof window.L === 'undefined') {
    return;
  }

  container.innerHTML = '';
  const canvas = document.createElement('div');
  canvas.className = 'leaflet-map';
  canvas.id = 'admin-map-canvas';
  container.appendChild(canvas);

  const map = window.L.map(canvas.id, {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([14.73, 121.15], 13);
  window.adminAttractionMap = map;

  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const form = document.getElementById('add-attraction-form');
  const nameInput = document.getElementById('attraction-name');
  const categoryInput = document.getElementById('attraction-category');
  const feeInput = document.getElementById('attraction-fee');
  const durationInput = document.getElementById('attraction-duration');
  const descriptionInput = document.getElementById('attraction-description');
  const positionInput = document.getElementById('attraction-position');
  const positionXInput = document.getElementById('attraction-position-x');
  const positionYInput = document.getElementById('attraction-position-y');
  const resetButton = document.getElementById('new-attraction-btn');
  const confirmPinButton = document.getElementById('confirm-pin-location');
  const pinPickerStatus = document.getElementById('pin-picker-status');
  const transportOptionList = document.getElementById('transport-option-list');
  const addTransportOptionButton = document.getElementById('add-transport-option');

  let editingId = null;
  let draftMarker = null;

  function addTransportOptionRow(option = {}) {
    if (!transportOptionList) return;
    const row = document.createElement('div');
    row.className = 'transport-editor-row';
    row.innerHTML = `
      <select data-transport-mode aria-label="Transport type">
        <option value="">Transport type</option>
        <option value="Jeepney">Jeepney</option>
        <option value="Tricycle">Tricycle</option>
        <option value="Bus">Bus</option>
        <option value="UV Express">UV Express</option>
        <option value="Taxi">Taxi</option>
        <option value="Walking">Walking</option>
        <option value="Private vehicle">Private vehicle</option>
        <option value="Other">Other</option>
      </select>
      <input data-transport-fare placeholder="Fare per person" aria-label="Fare per person" />
      <input data-transport-time placeholder="Estimated time" aria-label="Estimated time" />
      <input data-transport-route placeholder="Route or details" aria-label="Route or details" />
      <button class="btn btn-secondary" type="button" data-remove-transport>Remove</button>
    `;
    row.querySelector('[data-transport-mode]').value = option.mode || '';
    row.querySelector('[data-transport-fare]').value = option.fare || '';
    row.querySelector('[data-transport-time]').value = option.time || '';
    row.querySelector('[data-transport-route]').value = option.route || '';
    row.querySelector('[data-remove-transport]').addEventListener('click', () => row.remove());
    transportOptionList.appendChild(row);
  }

  function readTransportOptions() {
    return [...(transportOptionList?.querySelectorAll('.transport-editor-row') || [])]
      .map((row) => ({
        mode: row.querySelector('[data-transport-mode]')?.value.trim() || '',
        fare: row.querySelector('[data-transport-fare]')?.value.trim() || '',
        time: row.querySelector('[data-transport-time]')?.value.trim() || '',
        route: row.querySelector('[data-transport-route]')?.value.trim() || ''
      }))
      .filter((option) => option.mode);
  }

  addTransportOptionButton?.addEventListener('click', () => addTransportOptionRow());

  function populateForm(attraction) {
    editingId = attraction?.id || null;
    if (!nameInput || !categoryInput || !feeInput || !durationInput || !descriptionInput || !positionInput) {
      return;
    }
    nameInput.value = attraction?.name || '';
    categoryInput.value = attraction?.category || '';
    feeInput.value = attraction?.fee || '';
    durationInput.value = attraction?.duration || '';
    descriptionInput.value = attraction?.description || '';
    document.getElementById('attraction-trail').value = attraction?.trail || '';
    document.getElementById('attraction-expectations').value = attraction?.expectations || '';
    document.getElementById('attraction-terrain').value = attraction?.terrain || '';
    document.getElementById('attraction-start-point').value = attraction?.startPoint || '';
    document.getElementById('attraction-image').value = attraction?.images?.[0] || '';
    if (transportOptionList) {
      transportOptionList.innerHTML = '';
      const savedTransport = attraction?.transportOptions || attraction?.transport_options || attraction?.publicTransport || [];
      const transportRows = Array.isArray(savedTransport)
        ? savedTransport
        : (() => {
          try { return JSON.parse(savedTransport); } catch { return []; }
        })();
      transportRows.forEach(addTransportOptionRow);
    }

    const coords = attraction ? getAttractionCoords(attraction) : [14.73, 121.15];
    positionInput.value = `Lat ${coords[0].toFixed(4)}, Lng ${coords[1].toFixed(4)}`;
    positionXInput.value = coords[0].toFixed(6);
    positionYInput.value = coords[1].toFixed(6);
  }

  function setDraftPosition(lat, lng) {
    if (!positionInput || !positionXInput || !positionYInput) {
      return;
    }
    positionInput.value = `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
    positionXInput.value = lat.toFixed(6);
    positionYInput.value = lng.toFixed(6);
    editingId = null;
  }

  state.attractions.forEach((attraction) => {
    const coords = getAttractionCoords(attraction);
    const marker = window.L.marker(coords).addTo(map);
    marker.bindTooltip(attraction.name, { permanent: false });
    marker.on('click', () => {
      populateForm(attraction);
      if (draftMarker) {
        map.removeLayer(draftMarker);
        draftMarker = null;
      }
    });
  });

  map.on('click', (event) => {
    if (draftMarker) {
      map.removeLayer(draftMarker);
    }
    draftMarker = window.L.marker(event.latlng).addTo(map);
    draftMarker.bindTooltip('New pin location');
    setDraftPosition(event.latlng.lat, event.latlng.lng);
    if (confirmPinButton) confirmPinButton.disabled = false;
    if (pinPickerStatus) {
      pinPickerStatus.textContent = `Selected location: ${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
    }
  });

  resetButton?.addEventListener('click', () => {
    populateForm(null);
    if (transportOptionList) transportOptionList.innerHTML = '';
    if (draftMarker) {
      map.removeLayer(draftMarker);
      draftMarker = null;
    }
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const coords = [
      Number(formData.get('positionX') || 14.73),
      Number(formData.get('positionY') || 121.15)
    ];

    const existingAttraction = state.attractions.find((item) => item.id === editingId);
    const nextAttraction = {
      ...(existingAttraction || {}),
      id: editingId || `attraction-${Date.now()}`,
      name: formData.get('name') || 'New Attraction',
      category: formData.get('category') || 'Admin Added',
      fee: formData.get('fee') || '?0',
      duration: formData.get('duration') || '1 hour',
      description: formData.get('description') || 'Added from admin dashboard.',
      trail: formData.get('trail') || '',
      expectations: formData.get('expectations') || '',
      terrain: formData.get('terrain') || '',
      startPoint: formData.get('startPoint') || '',
      images: formData.get('image') ? [formData.get('image')] : [],
      transportOptions: readTransportOptions(),
      guideAvailable: true,
      coords
    };

    await updateState((currentState) => ({
      ...currentState,
      attractions: existingAttraction
        ? currentState.attractions.map((item) => (item.id === existingAttraction.id ? nextAttraction : item))
        : [nextAttraction, ...currentState.attractions]
    }));
    form.reset();
    populateForm(null);
    document.querySelector('[data-attraction-view="attraction-list-panel"]')?.click();
    document.getElementById('attraction-list-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  window.adminSelectAttraction = (attraction) => {
    populateForm(attraction);
    document.getElementById('attraction-add-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

// Admin overview cards and management lists
function renderAdminPage(state) {
  renderAdminMap(state);

  const bookingCount = document.getElementById('stat-bookings');
  if (bookingCount) {
    bookingCount.textContent = state.bookings.length;
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

  const attractionList = document.getElementById('admin-attractions-list');
  if (attractionList) {
    attractionList.innerHTML = '';
    state.attractions.forEach((attraction) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${attraction.name}</h3>
        <p><strong>Category:</strong> ${attraction.category || 'General'}</p>
        <p>${attraction.description}</p>
        <p><strong>Fee:</strong> ${attraction.fee} � <strong>Duration:</strong> ${attraction.duration}</p>
        <div class="attraction-management-actions">
          <button class="btn btn-secondary" type="button" data-attraction-edit>Edit</button>
          <button class="btn btn-secondary" type="button" data-attraction-delete>Delete</button>
        </div>
      `;
      card.querySelector('[data-attraction-edit]').addEventListener('click', () => {
        document.querySelector('[data-admin-tab="attractions"]')?.click();
        document.querySelector('[data-attraction-view="attraction-add-panel"]')?.click();
        window.adminSelectAttraction?.(attraction);
      });
      card.querySelector('[data-attraction-delete]').addEventListener('click', async () => {
        if (!window.confirm(`Delete ${attraction.name}?`)) return;
        await updateState((currentState) => ({
          ...currentState,
          attractions: currentState.attractions.filter((item) => item.id !== attraction.id)
        }));
      });
      attractionList.appendChild(card);
    });
  }

  const guideList = document.getElementById('admin-guides-list');
  if (guideList) {
    guideList.innerHTML = '';
    state.guides.forEach((guide) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${guide.name}</h3>
        <p><strong>Specialty:</strong> ${guide.specialty}</p>
        <p><strong>Contact:</strong> ${guide.contact}</p>
        <p><strong>Availability:</strong> ${guide.availability}</p>
      `;
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
        <p><strong>Login ID:</strong> ${escapeHtml(application.email || 'Created after approval')}</p>
        <p><strong>Availability:</strong> ${escapeHtml(application.availability || 'Not provided')}</p>
        <button class="btn btn-primary" type="button" data-approve-application>Approve guide</button>
      `;
      card.querySelector('[data-approve-application]').addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          guides: [{
            id: application.id,
            name: application.name,
            specialty: application.specialty || '',
            contact: application.contact || '',
            availability: application.availability || '',
            email: application.email || '',
            password: application.password || ''
          }, ...currentState.guides.filter((guide) => guide.id !== application.id)],
          guideApplications: (currentState.guideApplications || []).map((item) => (
            item.id === application.id ? { ...item, status: 'Approved' } : item
          ))
        }));
      });
      applicationsList.appendChild(card);
    });
  }

  window.AdminShopFeature?.render(state);

  const adminBookingsList = document.getElementById('admin-bookings-list');
  if (adminBookingsList) {
    adminBookingsList.innerHTML = '';
    state.bookings.forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${booking.attractionName}</h3>
        <p><strong>Traveler:</strong> ${booking.travelerName}</p>
        <p><strong>Contact:</strong> ${booking.contact || 'Not provided'}</p>
        <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
        <p><strong>Guide:</strong> ${booking.assignedGuide || 'Not assigned yet'}</p>
        <p>${booking.notes}</p>
        <div class="filter-row">
          <button class="btn btn-secondary" type="button" data-contact-traveler ${booking.contact ? '' : 'disabled'}>Contact traveler</button>
          <button class="btn btn-secondary" type="button" data-booking-action="mark-contacted" ${booking.contact ? '' : 'disabled'}>Mark contacted</button>
          <button class="btn btn-secondary" type="button" data-booking-action="approve" disabled>Approve</button>
          <select class="booking-form-input" data-guide-select aria-label="Select guide">
            <option value="">Select guide</option>
            ${state.guides.filter((guide) => guide.status !== 'Pending').map((guide) => `<option value="${escapeHtml(guide.name)}">${escapeHtml(guide.name)}</option>`).join('')}
          </select>
          <button class="btn btn-primary" type="button" data-booking-action="assign" disabled>Assign guide</button>
        </div>
      `;

      const approveButton = card.querySelector('[data-booking-action="approve"]');
      card.querySelector('[data-booking-action="mark-contacted"]')?.addEventListener('click', (event) => {
        event.currentTarget.textContent = 'Contacted';
        event.currentTarget.disabled = true;
        approveButton.disabled = false;
      });
      card.querySelector('[data-contact-traveler]')?.addEventListener('click', () => {
        if (booking.contact) window.location.href = `tel:${booking.contact}`;
      });
      approveButton.addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (item.id === booking.id ? { ...item, status: 'Approved' } : item))
        }));
      });

      card.querySelector('[data-booking-action="assign"]').addEventListener('click', async () => {
        const guideSelect = card.querySelector('[data-guide-select]');
        const selectedGuide = guideSelect?.value;
        if (!selectedGuide) {
          return;
        }
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (
            item.id === booking.id
              ? { ...item, status: 'Assigned', assignedGuide: selectedGuide }
              : item
          ))
        }));
      });
      card.querySelector('[data-guide-select]')?.addEventListener('change', (event) => {
        card.querySelector('[data-booking-action="assign"]').disabled = !event.currentTarget.value;
      });

      adminBookingsList.appendChild(card);
    });
  }

  const managementBookingCard = (booking, view) => `
    <article class="dashboard-card" data-management-booking="${escapeHtml(booking.id)}">
      <h3>${escapeHtml(booking.attractionName || 'Tour')}</h3>
      <p><strong>Traveler:</strong> ${escapeHtml(booking.travelerName || 'Guest')}</p>
      <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
      <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
      <p><strong>Date:</strong> ${escapeHtml(booking.date || 'Not scheduled')}</p>
      <p><strong>Status:</strong> ${escapeHtml(booking.status || 'Pending')}</p>
      <p><strong>Guide:</strong> ${escapeHtml(booking.assignedGuide || 'Not assigned')}</p>
      ${view === 'pending' ? `<div class="filter-row">
        <button class="btn btn-secondary" type="button" data-management-contact ${booking.contact ? '' : 'disabled'}>Call traveler</button>
        <button class="btn btn-primary" type="button" data-management-approve ${booking.contact ? '' : 'disabled'}>Approve booking</button>
      </div>` : ''}
      ${view === 'approved' ? `<div class="filter-row">
        <select class="booking-form-input" data-management-guide aria-label="Select guide">
          <option value="">Select guide</option>
          ${state.guides.filter((guide) => guide.status !== 'Pending').map((guide) => `<option value="${escapeHtml(guide.name)}">${escapeHtml(guide.name)}</option>`).join('')}
        </select>
        <button class="btn btn-primary" type="button" data-management-assign ${booking.assignedGuide ? 'disabled' : 'disabled'}>Assign guide</button>
      </div>` : ''}
    </article>
  `;
  const managementLists = {
    pending: document.getElementById('management-pending-list'),
    approved: document.getElementById('management-approved-list'),
    completed: document.getElementById('management-completed-list')
  };
  const renderManagementList = (element, items, emptyText, view) => {
    if (!element) return;
    element.innerHTML = items.length ? items.map((booking) => managementBookingCard(booking, view)).join('') : `<p class="empty-state">${emptyText}</p>`;
    items.forEach((booking) => {
      const card = element.querySelector(`[data-management-booking="${CSS.escape(booking.id)}"]`);
      if (!card) return;
      card.querySelector('[data-management-contact]')?.addEventListener('click', () => {
        window.location.href = `tel:${booking.contact}`;
        const approve = card.querySelector('[data-management-approve]');
        if (approve) approve.disabled = false;
      });
      card.querySelector('[data-management-approve]')?.addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => item.id === booking.id ? { ...item, status: 'Approved' } : item)
        }));
      });
      card.querySelector('[data-management-guide]')?.addEventListener('change', (event) => {
        card.querySelector('[data-management-assign]').disabled = !event.currentTarget.value;
      });
      card.querySelector('[data-management-assign]')?.addEventListener('click', async () => {
        const selectedGuide = card.querySelector('[data-management-guide]').value;
        if (!selectedGuide) return;
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => item.id === booking.id ? { ...item, status: 'Assigned', assignedGuide: selectedGuide } : item)
        }));
      });
    });
  };
  renderManagementList(managementLists.pending, state.bookings.filter((booking) => booking.status === 'Pending'), 'No pending bookings.', 'pending');
  renderManagementList(managementLists.approved, state.bookings.filter((booking) => ['Approved', 'Assigned', 'Confirmed'].includes(booking.status)), 'No approved bookings.', 'approved');
  renderManagementList(managementLists.completed, state.bookings.filter((booking) => booking.status === 'Completed'), 'No completed bookings.', 'completed');
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

async function renderApp(state) { renderAdminPage(state); }
document.addEventListener('DOMContentLoaded', async () => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
  setupAdminControls();
  appState = await loadState();
  await renderApp(appState);
});
