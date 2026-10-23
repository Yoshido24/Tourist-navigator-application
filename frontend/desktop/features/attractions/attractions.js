// Admin attraction map, pin picker, and attraction form
(function () {
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

    if (addTransportOptionButton) {
      addTransportOptionButton.onclick = () => window.AdminTransportFeature.addRow(transportOptionList);
    }

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
      const imageInput = document.getElementById('attraction-image');
      const imageUrls = Array.isArray(attraction?.images)
        ? attraction.images
        : attraction?.images
          ? [attraction.images]
          : [];
      if (imageInput) imageInput.value = imageUrls.join('\n');
      const savedTransport = attraction?.transportOptions || attraction?.transport_options || attraction?.publicTransport || [];
      window.AdminTransportFeature.loadOptions(transportOptionList, savedTransport);

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
      if (form.dataset.saving === 'true') return;
      form.dataset.saving = 'true';
      try {
      const formData = new FormData(form);
      const coords = [
        Number(formData.get('positionX') || 14.73),
        Number(formData.get('positionY') || 121.15)
      ];

      const existingAttraction = state.attractions.find((item) => item.id === editingId);
      const nextAttraction = {
        ...(existingAttraction || {}),
        id: editingId || `attraction-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`,
        name: formData.get('name') || 'New Attraction',
        category: formData.get('category') || 'Admin Added',
        fee: formData.get('fee') || '?0',
        duration: formData.get('duration') || '1 hour',
        description: formData.get('description') || 'Added from admin dashboard.',
        trail: formData.get('trail') || '',
        expectations: formData.get('expectations') || '',
        terrain: formData.get('terrain') || '',
        startPoint: formData.get('startPoint') || '',
        images: String(formData.get('image') || '')
          .split(/\r?\n/)
          .map((imageUrl) => imageUrl.trim())
          .filter(Boolean),
        transportOptions: window.AdminTransportFeature.readOptions(transportOptionList),
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
      if (window.lastSyncErrors?.attractions) {
        window.alert(`The attraction could not be saved to the database: ${window.lastSyncErrors.attractions.message || 'unknown error'}`);
      }
      } finally {
        delete form.dataset.saving;
      }
    });

    window.adminSelectAttraction = (attraction) => {
      populateForm(attraction);
      document.getElementById('attraction-add-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  }

  function renderAdminAttractionsList(state) {
    const attractionList = document.getElementById('admin-attractions-list');
    if (!attractionList) return;

    attractionList.innerHTML = '';
    state.attractions.forEach((attraction) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${escapeHtml(attraction.name)}</h3>
        <p><strong>Category:</strong> ${escapeHtml(attraction.category || 'General')}</p>
        <p>${escapeHtml(attraction.description)}</p>
        <p><strong>Fee:</strong> ${escapeHtml(attraction.fee)} • <strong>Duration:</strong> ${escapeHtml(attraction.duration)}</p>
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

  window.AdminAttractionsFeature = {
    renderMap: renderAdminMap,
    renderList: renderAdminAttractionsList
  };
})();
