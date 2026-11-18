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

  function createAttractionPopup(attraction) {
    const images = getAttractionImages(attraction);
    const popup = document.createElement('div');
    popup.className = 'map-popup';
    if (!images.length) {
      const message = document.createElement('p');
      message.textContent = 'No images available for this attraction.';
      popup.appendChild(message);
      return popup;
    }

    let index = 0;
    const image = document.createElement('img');
    image.src = images[index];
    image.alt = attraction.name;
    popup.appendChild(image);

    if (images.length > 1) {
      const controls = document.createElement('div');
      controls.className = 'map-photo-controls';
      const previous = document.createElement('button');
      const next = document.createElement('button');
      const counter = document.createElement('span');
      previous.type = next.type = 'button';
      previous.textContent = '‹';
      next.textContent = '›';
      previous.setAttribute('aria-label', 'Previous photo');
      next.setAttribute('aria-label', 'Next photo');
      counter.setAttribute('aria-live', 'polite');
      function showPhoto(nextIndex) {
        index = (nextIndex + images.length) % images.length;
        image.src = images[index];
        counter.textContent = `${index + 1} / ${images.length}`;
      }
      previous.addEventListener('click', () => showPhoto(index - 1));
      next.addEventListener('click', () => showPhoto(index + 1));
      counter.textContent = `1 / ${images.length}`;
      controls.appendChild(previous);
      controls.appendChild(counter);
      controls.appendChild(next);
      popup.appendChild(controls);
    }
    return popup;
  }

  function getValidResortCoords(resort) {
    let coords = resort.coords;
    if (typeof coords === 'string') {
      try { coords = JSON.parse(coords); } catch { return null; }
    }
    if (!Array.isArray(coords) || coords.length !== 2
        || typeof coords[0] !== 'number' || typeof coords[1] !== 'number'
        || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])
        || Math.abs(coords[0]) > 90 || Math.abs(coords[1]) > 180) return null;
    return coords;
  }

  function resortServices(resort) {
    return (Array.isArray(resort.services) ? resort.services : []).map((service) =>
      `<li>${escapeHtml(service.name)} — ₱${Number(service.fee).toLocaleString('en-PH')} / ${escapeHtml(service.pricingUnit)}</li>`
    ).join('');
  }

  function createResortPopup(resort) {
    const popup = document.createElement('div');
    popup.className = 'map-popup';
    popup.innerHTML = `
      <h3>${escapeHtml(resort.name)}</h3>
      <p>${escapeHtml(resort.address || 'Approved resort listing')}</p>
      <ul>${resortServices(resort) || '<li>No services are currently listed.</li>'}</ul>
    `;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-primary';
    button.textContent = 'Choose services';
    button.addEventListener('click', () => window.UserResortsFeature?.select?.(resort.id));
    popup.appendChild(button);
    return popup;
  }

  function renderMapFeature(state) {
    const mapElement = document.getElementById('tourist-map');
    const detailsElement = document.getElementById('tourist-map-details');
    if (!mapElement || typeof window.L === 'undefined') return;
    const allAttractions = state.attractions || [];
    const activeCategory = window.UserAttractionsFeature?.getActiveCategory?.() || 'all';
    const attractions = window.UserAttractionsFeature?.filterByCategory
      ? window.UserAttractionsFeature.filterByCategory(allAttractions, activeCategory)
      : allAttractions;
    const resorts = activeCategory === 'resort'
      ? (state.resorts || []).map((resort) => ({ resort, coords: getValidResortCoords(resort) }))
        .filter((entry) => entry.coords)
      : [];
    if (touristMapInstance) {
      touristMapInstance.remove();
      touristMapInstance = null;
    }
    mapElement.innerHTML = '';
    if (!allAttractions.length && activeCategory !== 'resort') {
      if (detailsElement) detailsElement.innerHTML = '<p>No attractions have been published yet. Please check back soon.</p>';
      return;
    }
    if (activeCategory === 'resort' && !resorts.length) {
      if (detailsElement) detailsElement.innerHTML = '<p>No approved resorts with map locations are available yet.</p>';
      return;
    }
    if (detailsElement) {
      detailsElement.innerHTML = '<p class="map-loading">Loading attraction pins. Select a pin when the map is ready.</p>';
    }

    const firstCoords = attractions.length
      ? getAttractionCoords(attractions[0])
      : resorts[0]?.coords || getAttractionCoords(allAttractions[0]);
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
    const markers = [];
    attractions.forEach((attraction) => {
      const coords = getAttractionCoords(attraction);
      bounds.push(coords);
      const marker = window.L.marker(coords).addTo(map);
      marker.bindTooltip(attraction.name);
      marker.bindPopup(createAttractionPopup(attraction), { maxWidth: 340 });
      marker.on('click', () => selectAttraction(attraction, marker));
      markers.push(marker);
    });
    resorts.forEach(({ resort, coords }) => {
      bounds.push(coords);
      const marker = window.L.marker(coords).addTo(map);
      marker.bindTooltip(resort.name);
      marker.bindPopup(createResortPopup(resort), { maxWidth: 340 });
      marker.on('click', () => selectResort(resort, marker));
      markers.push(marker);
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });

    const pinPanel = document.createElement('div');
    pinPanel.className = 'map-pin-panel';
    pinPanel.innerHTML = `<strong class="map-pin-panel-title">${activeCategory === 'resort' ? 'Approved resort pins' : activeCategory === 'all' ? 'All attraction pins' : `${escapeHtml(activeCategory)} attraction pins`}</strong>`;
    attractions.forEach((attraction, index) => {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'map-pin-button';
      pin.setAttribute('aria-label', `Show ${attraction.name} on the map`);
      pin.innerHTML = `<span class="map-pin-icon" aria-hidden="true">📍</span><span>${escapeHtml(attraction.name)}</span>`;
      pin.addEventListener('click', () => selectAttraction(attraction, markers[index]));
      pinPanel.appendChild(pin);
    });
    resorts.forEach(({ resort }, index) => {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'map-pin-button';
      pin.setAttribute('aria-label', `Show ${resort.name} on the map`);
      pin.innerHTML = `<span class="map-pin-icon" aria-hidden="true">📍</span><span>${escapeHtml(resort.name)}</span>`;
      pin.addEventListener('click', () => selectResort(resort, markers[index]));
      pinPanel.appendChild(pin);
    });
    mapElement.appendChild(pinPanel);
    if (detailsElement) {
      detailsElement.innerHTML = resorts.length
        ? '<p>Select an approved resort pin to view its services and fees.</p>'
        : attractions.length
        ? '<p>Select an attraction pin to view its details.</p>'
        : '<p>No attractions in this category yet.</p>';
    }

    function selectAttraction(attraction, marker = null) {
      const coords = getAttractionCoords(attraction);
      map.setView(coords, 16);
      marker?.openPopup();
      mapElement.querySelectorAll('.map-pin-button').forEach((button) => {
        button.classList.toggle('active', button.textContent.includes(attraction.name));
      });
      if (detailsElement) {
        const trail = attraction.trail || attraction.route;
        detailsElement.innerHTML = `
          <h3>${escapeHtml(attraction.name)}</h3>
          <p>${escapeHtml(attraction.description || 'Explore this attraction.')}</p>
          <p><strong>Fee:</strong> ${escapeHtml(attraction.fee || 'Contact admin')}</p>
          ${trail ? `<p><strong>Trail or route:</strong> ${escapeHtml(trail)}</p>` : ''}
          <button class="btn btn-secondary map-view-more" type="button">View more</button>
        `;
        detailsElement.querySelector('.map-view-more')?.addEventListener('click', () => {
          if (!document.getElementById('user-attractions')) {
            window.location.href = 'user.html';
            return;
          }
          showUserTab('user-attractions');
          document.getElementById('selected-attraction-name')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      window.UserAttractionsFeature?.select?.(attraction);
    }

    function selectResort(resort, marker = null) {
      const coords = getValidResortCoords(resort);
      if (!coords) return;
      map.setView(coords, 16);
      marker?.openPopup();
      mapElement.querySelectorAll('.map-pin-button').forEach((button) => {
        button.classList.toggle('active', button.textContent.includes(resort.name));
      });
      if (detailsElement) {
        detailsElement.innerHTML = `
          <h3>${escapeHtml(resort.name)}</h3>
          <p>${escapeHtml(resort.description || 'Contact the resort for details.')}</p>
          <h4>Services and fees</h4>
          <ul>${resortServices(resort) || '<li>No services are currently listed.</li>'}</ul>
          <button class="btn btn-primary map-select-resort" type="button">Continue to resort booking</button>
        `;
        detailsElement.querySelector('.map-select-resort')?.addEventListener('click', () => {
          window.UserResortsFeature?.select?.(resort.id);
        });
      }
    }
  }

  window.UserMapFeature = {
    render: renderMapFeature
  };
})();
