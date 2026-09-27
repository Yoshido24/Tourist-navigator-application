// Tourist map: pins, popups, and pin panel selection
(function () {
  function getAttractionImages(attraction) {
    if (Array.isArray(attraction.images)) return attraction.images.filter(Boolean);
    if (typeof attraction.images !== 'string' || !attraction.images.trim()) return [];

    try {
      const parsed = JSON.parse(attraction.images);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [attraction.images];
    } catch {
      return [attraction.images];
    }
  }

  function getAttractionPopup(attraction, coords) {
    const trail = attraction.trail || attraction.route;
    const mainImage = getAttractionImages(attraction)[0];
    return `
      <article class="map-popup">
        ${mainImage ? `<img src="${escapeHtml(mainImage)}" alt="${escapeHtml(attraction.name)}" />` : ''}
        <h3>${escapeHtml(attraction.name)}</h3>
        <p>${escapeHtml(attraction.description || 'Explore this attraction.')}</p>
        <p><strong>Fee:</strong> ${escapeHtml(attraction.fee || 'Contact admin')}</p>
        ${trail ? `<p><strong>Trail or route:</strong> ${escapeHtml(trail)}</p>` : ''}
      </article>
    `;
  }

  function renderMapFeature(state) {
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
      window.UserAttractionsFeature?.select?.(attraction);
    }
  }

  window.UserMapFeature = {
    render: renderMapFeature
  };
})();
