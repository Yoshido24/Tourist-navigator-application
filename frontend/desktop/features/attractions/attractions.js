// Admin attraction map, pin picker, and attraction form
(function () {
  let map;
  let currentState;
  let attractionMarkers = [];
  let editingId = null;
  let draftMarker = null;
  let draftPosition = null;
  let controlsInitialized = false;

  function renderAdminMap(state) {
    const container = document.getElementById('admin-map-view');
    if (!container || typeof window.L === 'undefined') {
      return;
    }

    currentState = state;
    if (!map) {
      container.innerHTML = '';
      const canvas = document.createElement('div');
      canvas.className = 'leaflet-map';
      canvas.id = 'admin-map-canvas';
      container.appendChild(canvas);

      map = window.L.map(canvas.id, {
        zoomControl: true,
        scrollWheelZoom: true
      }).setView([14.73, 121.15], 13);
      window.adminAttractionMap = map;

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
    }

    const form = document.getElementById('add-attraction-form');
    const nameInput = document.getElementById('attraction-name');
    const categoryInput = document.getElementById('attraction-category');
    const categories = window.ATTRACTION_CATEGORIES || [];
    const feeInput = document.getElementById('attraction-fee');
    const durationInput = document.getElementById('attraction-duration');
    const descriptionInput = document.getElementById('attraction-description');
    const positionInput = document.getElementById('attraction-position');
    const positionXInput = document.getElementById('attraction-position-x');
    const positionYInput = document.getElementById('attraction-position-y');
    const resetButton = document.getElementById('new-attraction-btn');
    const confirmPinButton = document.getElementById('confirm-pin-location');
    const pinPickerStatus = document.getElementById('pin-picker-status');
    const pinPickerModal = document.getElementById('pin-picker-modal');
    const transportOptionList = document.getElementById('transport-option-list');
    const addTransportOptionButton = document.getElementById('add-transport-option');

    if (addTransportOptionButton) {
      addTransportOptionButton.onclick = () => window.AdminTransportFeature.addRow(transportOptionList);
    }

    function populateForm(attraction) {
      editingId = attraction?.id || null;
      if (!nameInput || !categoryInput || !feeInput || !durationInput || !descriptionInput || !positionInput) {
        return;
      }
      nameInput.value = attraction?.name || '';
      categoryInput.innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
      if (attraction?.category && !categories.includes(attraction.category)) {
        const option = document.createElement('option');
        option.value = attraction.category;
        option.textContent = attraction.category;
        categoryInput.appendChild(option);
      }
      categoryInput.value = attraction?.category || categories[0] || '';
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
      if (imageInput) imageInput.value = '';
      renderAttractionPhotoList(document.getElementById('attraction-existing-photos'), imageUrls);
      const savedTransport = attraction?.transportOptions || attraction?.transport_options || attraction?.publicTransport || [];
      window.AdminTransportFeature.loadOptions(transportOptionList, savedTransport);

      const coords = attraction ? getAttractionCoords(attraction) : [14.73, 121.15];
      positionInput.value = attraction ? `Lat ${coords[0].toFixed(4)}, Lng ${coords[1].toFixed(4)}` : 'Choose a pin location first.';
      positionXInput.value = attraction ? coords[0].toFixed(6) : '';
      positionYInput.value = attraction ? coords[1].toFixed(6) : '';
    }

    function setDraftPosition(lat, lng) {
      if (!positionInput || !positionXInput || !positionYInput) {
        return;
      }
      positionInput.value = `Lat ${lat.toFixed(4)}, Lng ${lng.toFixed(4)}`;
      positionXInput.value = lat.toFixed(6);
      positionYInput.value = lng.toFixed(6);
    }

    function closePinPicker() {
      if (draftMarker) map.removeLayer(draftMarker);
      draftMarker = null;
      draftPosition = null;
      pinPickerModal.hidden = true;
    }

    function selectForEdit(attraction) {
      populateForm(attraction);
      if (draftMarker) {
        map.removeLayer(draftMarker);
        draftMarker = null;
      }
      document.querySelector('[data-attraction-view="attraction-add-panel"]')?.click();
      document.getElementById('attraction-add-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (!controlsInitialized) {
      controlsInitialized = true;
      map.on('click', (event) => {
        if (draftMarker) map.removeLayer(draftMarker);
        draftPosition = [event.latlng.lat, event.latlng.lng];
        draftMarker = window.L.marker(draftPosition).addTo(map);
        draftMarker.bindTooltip('New pin location');
        if (confirmPinButton) confirmPinButton.disabled = false;
        if (pinPickerStatus) {
          pinPickerStatus.textContent = `Selected location: ${draftPosition[0].toFixed(5)}, ${draftPosition[1].toFixed(5)}`;
        }
      });

      resetButton?.addEventListener('click', () => {
        pinPickerModal.hidden = false;
        if (draftMarker) map.removeLayer(draftMarker);
        draftMarker = null;
        const latitude = Number(positionXInput.value);
        const longitude = Number(positionYInput.value);
        if (Number.isFinite(latitude) && Number.isFinite(longitude) && positionXInput.value && positionYInput.value) {
          draftPosition = [latitude, longitude];
          draftMarker = window.L.marker(draftPosition).addTo(map);
          draftMarker.bindTooltip('Selected pin location');
          map.setView(draftPosition, 13);
          if (confirmPinButton) confirmPinButton.disabled = false;
          if (pinPickerStatus) pinPickerStatus.textContent = `Selected location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        } else {
          draftPosition = null;
          if (confirmPinButton) confirmPinButton.disabled = true;
          if (pinPickerStatus) pinPickerStatus.textContent = 'No location selected yet.';
        }
        window.setTimeout(() => map.invalidateSize(), 0);
      });
      document.querySelector('[data-close-pin-picker]')?.addEventListener('click', () => {
        closePinPicker();
      });
      confirmPinButton?.addEventListener('click', () => {
        if (!draftPosition) return;
        setDraftPosition(draftPosition[0], draftPosition[1]);
        closePinPicker();
      });

      form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.dataset.saving === 'true') return;
      form.dataset.saving = 'true';
      try {
      const formData = new FormData(form);
      const latitude = formData.get('positionX');
      const longitude = formData.get('positionY');
      const coords = [
        Number(latitude),
        Number(longitude)
      ];

      const existingAttraction = currentState.attractions.find((item) => item.id === editingId);
      if (!latitude || !longitude || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])
          || Math.abs(coords[0]) > 90 || Math.abs(coords[1]) > 180) {
        window.alert('Choose a valid pin location before saving the attraction.');
        return;
      }
      let images;
      try {
        images = await collectAttractionPhotos(
          document.getElementById('attraction-existing-photos'),
          document.getElementById('attraction-image')
        );
      } catch (error) {
        window.alert(error.message);
        return;
      }
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
        images,
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

      pinPickerModal.addEventListener('click', (event) => {
        if (event.target.id === 'pin-picker-modal') closePinPicker();
      });
      populateForm(null);
    }

    attractionMarkers.forEach((marker) => map.removeLayer(marker));
    attractionMarkers = state.attractions.map((attraction) => {
      const marker = window.L.marker(getAttractionCoords(attraction)).addTo(map);
      marker.bindTooltip(attraction.name, { permanent: false });
      marker.on('click', () => selectForEdit(attraction));
      return marker;
    });

    window.AdminAttractionsFeature.selectForEdit = selectForEdit;
    window.adminSelectAttraction = selectForEdit;
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
          <button class="btn btn-secondary" type="button" data-edit-attraction="${escapeHtml(attraction.id)}">Edit</button>
          <button class="btn btn-secondary" type="button" data-delete-attraction="${escapeHtml(attraction.id)}">Delete</button>
        </div>
      `;
      card.querySelector('[data-edit-attraction]').addEventListener('click', () => {
        window.AdminAttractionsFeature.selectForEdit(attraction);
      });
      const deleteButton = card.querySelector('[data-delete-attraction]');
      deleteButton.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${attraction.name}"? Existing bookings will remain.`)) return;
        deleteButton.disabled = true;
        try {
          if (USE_SUPABASE) {
            const { data, error } = await supabaseClient.from('attractions')
              .delete().eq('id', attraction.id).select('id').maybeSingle();
            if (error) throw error;
            if (!data) throw new Error('Attraction was not deleted. Refresh and try again.');
            appState = { ...appState, attractions: appState.attractions.filter((item) => item.id !== attraction.id) };
            writeLocalAttractions(appState.attractions);
            try {
              await renderApp(appState);
            } catch (error) {
              window.alert(`Attraction deleted, but the page could not refresh: ${error.message}`);
            }
          } else {
            await updateState((current) => ({
              ...current, attractions: current.attractions.filter((item) => item.id !== attraction.id)
            }));
          }
          if (editingId === attraction.id) {
            editingId = null;
            document.getElementById('add-attraction-form')?.reset();
            const photos = document.getElementById('attraction-existing-photos');
            if (photos) photos.innerHTML = '';
            const transport = document.getElementById('transport-option-list');
            if (transport) window.AdminTransportFeature.loadOptions(transport, []);
          }
        } catch (error) {
          window.alert(`Attraction was not deleted: ${error.message}`);
        } finally {
          deleteButton.disabled = false;
        }
      });
      attractionList.appendChild(card);
    });
  }

  window.AdminAttractionsFeature = {
    renderMap: renderAdminMap,
    renderList: renderAdminAttractionsList,
    selectForEdit: null
  };
})();
