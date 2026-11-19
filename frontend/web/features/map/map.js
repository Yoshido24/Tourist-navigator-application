// Tourist map: pins, popups, and pin panel selection
(function () {
  let announcementRefreshTimer = null;

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

  function getShowcaseCoords(showcase) {
    const latitude = Number(showcase.latitude);
    const longitude = Number(showcase.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return [latitude, longitude];
  }

  function createShowcasePopup(showcase) {
    const popup = document.createElement('div');
    popup.className = 'map-popup';
    const title = document.createElement('strong');
    const description = document.createElement('p');
    title.textContent = showcase.name;
    description.textContent = showcase.description;
    popup.appendChild(title);
    popup.appendChild(description);
    return popup;
  }

  function renderAnnouncements(announcements) {
    const container = document.getElementById('tourist-announcements');
    if (!container) return;
    if (announcementRefreshTimer) window.clearTimeout(announcementRefreshTimer);

    const now = Date.now();
    const currentAnnouncements = (Array.isArray(announcements) ? announcements : [])
      .filter((item) => {
        const startsAt = Date.parse(item.starts_at);
        const endsAt = Date.parse(item.ends_at);
        return Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt > now && endsAt > startsAt;
      })
      .sort((left, right) => Date.parse(left.starts_at) - Date.parse(right.starts_at));

    container.hidden = !currentAnnouncements.length;
    const emptyMessage = document.getElementById('tourist-announcements-empty');
    if (emptyMessage) emptyMessage.hidden = currentAnnouncements.length > 0;
    container.innerHTML = currentAnnouncements.map((item) => {
      const bannerUrl = item.banner_path && supabaseClient?.storage?.from('event-banners')
        .getPublicUrl(item.banner_path).data?.publicUrl;
      return `
        <article class="event-announcement">
          ${bannerUrl ? `<img class="event-announcement-banner" src="${escapeHtml(bannerUrl)}" alt="Banner for ${escapeHtml(item.title)}" loading="lazy">` : ''}
          <div class="event-announcement-content">
            <p class="eyebrow">Community announcement</p>
            <h3>${escapeHtml(item.title)}</h3>
            <p><strong>When:</strong> ${escapeHtml(new Date(item.starts_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }))} – ${escapeHtml(new Date(item.ends_at).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }))}</p>
            <p><strong>Where:</strong> ${escapeHtml(item.venue)} · <strong>Hosted by:</strong> ${escapeHtml(item.organizer)}</p>
            <details>
              <summary>Event details</summary>
              <p>${escapeHtml(item.description)}</p>
            </details>
          </div>
        </article>`;
    }).join('');
    if (currentAnnouncements.length) {
        const nextEnd = Math.min(...currentAnnouncements.map((item) => Date.parse(item.ends_at)));
        const delay = Math.min(nextEnd - now + 50, 24 * 60 * 60 * 1000);
        announcementRefreshTimer = window.setTimeout(() => renderAnnouncements(announcements), delay);
    }
  }

  function renderMapFeature(state) {
    const mapElement = document.getElementById('tourist-map');
    const detailsElement = document.getElementById('tourist-map-details');
    renderAnnouncements(state.announcements);
    if (!mapElement || typeof window.L === 'undefined') return;
    if (touristMapInstance) {
      touristMapInstance.remove();
      touristMapInstance = null;
    }
    mapElement.innerHTML = '';
    const attractions = Array.isArray(state.attractions) ? state.attractions : [];
    const showcases = (Array.isArray(state.showcases) ? state.showcases : [])
      .map((showcase) => ({ showcase, coords: getShowcaseCoords(showcase) }))
      .filter(({ coords }) => coords);
    if (!attractions.length && !showcases.length) {
      if (detailsElement) detailsElement.innerHTML = '<p>No places have been published yet. Please check back soon.</p>';
      return;
    }
    if (detailsElement) {
      detailsElement.innerHTML = '<p class="map-loading">Loading map pins. Select a pin when the map is ready.</p>';
    }

    const firstCoords = attractions.length ? getAttractionCoords(attractions[0]) : showcases[0].coords;
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
    const pinPanel = document.createElement('div');
    pinPanel.className = 'map-pin-panel';
    pinPanel.innerHTML = '<strong class="map-pin-panel-title">All map pins</strong>';
    attractions.forEach((attraction) => {
      const coords = getAttractionCoords(attraction);
      bounds.push(coords);
      const marker = window.L.marker(coords).addTo(map);
      marker.bindTooltip(attraction.name);
      marker.bindPopup(createAttractionPopup(attraction), { maxWidth: 340 });
      marker.on('click', () => selectAttraction(attraction, marker));
      addPinButton(attraction.id, attraction.name, false, () => selectAttraction(attraction, marker));
    });
    showcases.forEach(({ showcase, coords }) => {
      bounds.push(coords);
      const marker = window.L.marker(coords).addTo(map);
      marker.bindTooltip(showcase.name);
      marker.bindPopup(createShowcasePopup(showcase), { maxWidth: 340 });
      marker.on('click', () => selectShowcase(showcase, coords, marker));
      addPinButton(showcase.id, showcase.name, true, () => selectShowcase(showcase, coords, marker));
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30] });

    function addPinButton(id, name, isShowcase, onClick) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'map-pin-button';
      pin.setAttribute('data-id', id);
      pin.setAttribute('data-kind', isShowcase ? 'showcase' : 'attraction');
      pin.setAttribute('aria-label', `Show ${isShowcase ? 'showcase place' : 'attraction'} ${name} on the map`);
      pin.innerHTML = `<span class="map-pin-icon" aria-hidden="true">📍</span><span>${isShowcase ? 'Showcase · ' : ''}${escapeHtml(name)}</span>`;
      pin.addEventListener('click', onClick);
      pinPanel.appendChild(pin);
    }

    mapElement.appendChild(pinPanel);
    if (detailsElement) {
      detailsElement.innerHTML = '<p>Select a map pin to view its details.</p>';
    }

    function selectAttraction(attraction, marker = null) {
      const coords = getAttractionCoords(attraction);
      map.setView(coords, 16);
      marker?.openPopup();
      mapElement.querySelectorAll('.map-pin-button').forEach((button) => {
        button.classList.toggle('active', button.dataset.kind === 'attraction' && button.dataset.id === attraction.id);
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

    function selectShowcase(showcase, coords, marker = null) {
      map.setView(coords, 16);
      marker?.openPopup();
      mapElement.querySelectorAll('.map-pin-button').forEach((button) => {
        button.classList?.toggle('active', button.dataset?.kind === 'showcase' && button.dataset?.id === showcase.id);
      });
      if (detailsElement) {
        detailsElement.innerHTML = `
          <p class="eyebrow">Showcase</p>
          <h3>${escapeHtml(showcase.name)}</h3>
          <p>${escapeHtml(showcase.description || '')}</p>
        `;
      }
    }
  }

  window.UserMapFeature = {
    render: renderMapFeature
  };
})();
