// Tourist directions, route preview, and public transport options
(function () {
  function resetDirections() {
    const directionsSummary = document.getElementById('directions-summary');
    const directionsMap = document.getElementById('directions-map');
    const transportOptions = document.getElementById('transport-options');
    const directionsActions = document.getElementById('directions-actions');
    if (directionsSummary) directionsSummary.textContent = 'Select an attraction to load its route and public transport details.';
    if (directionsMap) {
      directionsMap.removeAttribute('src');
      directionsMap.hidden = true;
    }
    if (transportOptions) transportOptions.innerHTML = '<p class="muted">Select an attraction to see available public transport.</p>';
    if (directionsActions) directionsActions.innerHTML = '';
  }

  function renderDirections(attraction) {
    const directionsSummary = document.getElementById('directions-summary');
    const directionsMap = document.getElementById('directions-map');
    const transportOptions = document.getElementById('transport-options');
    const directionsActions = document.getElementById('directions-actions');

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
  }

  window.UserDirectionsFeature = {
    render: renderDirections,
    reset: resetDirections
  };
})();
