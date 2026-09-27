// Tourist attraction discovery: list, detail panel, and Book form sync
(function () {
  function renderAttractionsFeature(state) {
    const attractionsList = document.getElementById('attraction-selector');
    const selectedName = document.getElementById('selected-attraction-name');
    const selectedDescription = document.getElementById('selected-attraction-description');
    const selectedExpectations = document.getElementById('selected-attraction-expectations');
    const selectedTerrain = document.getElementById('selected-attraction-terrain');
    const selectedStartPoint = document.getElementById('selected-attraction-startpoint');
    const selectedTrail = document.getElementById('selected-attraction-trail');
    const gallery = document.getElementById('attraction-gallery');
    const placeSelect = document.getElementById('place');

    if (attractionsList) {
      attractionsList.innerHTML = '';
      state.attractions.forEach((attraction) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'attraction-option';
        button.innerHTML = `
          <span>${escapeHtml(attraction.name)}</span>
          <strong>${escapeHtml(attraction.fee || '')}</strong>
        `;
        button.addEventListener('click', () => selectAttraction(attraction));
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
      if (placeSelect.dataset.attractionSyncBound !== 'true') {
        placeSelect.dataset.attractionSyncBound = 'true';
        placeSelect.addEventListener('change', () => {
          const attraction = state.attractions.find((item) => item.id === placeSelect.value);
          if (attraction) selectAttraction(attraction);
        });
      }
    }

    if (selectedName) selectedName.textContent = 'Select an attraction';
    if (selectedDescription) selectedDescription.textContent = 'Choose a pin on the map or an attraction from the list to see its details.';
    if (selectedExpectations) selectedExpectations.textContent = 'Waiting for an attraction selection.';
    if (selectedTerrain) selectedTerrain.textContent = 'Waiting for an attraction selection.';
    if (selectedStartPoint) selectedStartPoint.textContent = 'Waiting for an attraction selection.';
    if (selectedTrail) selectedTrail.textContent = 'Waiting for an attraction selection.';
    if (gallery) gallery.innerHTML = '';
    window.UserDirectionsFeature?.reset();

    const preservedAttraction = state.attractions.find((item) => item.id === selectedUserAttractionId);
    if (preservedAttraction) {
      selectAttraction(preservedAttraction);
    }

    function selectAttraction(attraction) {
      if (selectedName) selectedName.textContent = attraction.name;
      if (selectedDescription) selectedDescription.textContent = attraction.description;
      if (selectedExpectations) selectedExpectations.textContent = attraction.expectations || 'A smooth, guided experience with friendly staff.';
      if (selectedTerrain) selectedTerrain.textContent = attraction.terrain || 'Easy walking with support available.';
      if (selectedStartPoint) selectedStartPoint.textContent = attraction.startPoint || 'Please contact the team for meetup details.';
      if (selectedTrail) selectedTrail.textContent = attraction.trail || attraction.route || 'Route details will be confirmed by the attraction team.';

      if (gallery) {
        gallery.innerHTML = '';
        const imageUrls = Array.isArray(attraction.images)
          ? attraction.images
          : typeof attraction.images === 'string'
            ? (() => {
              try {
                const parsed = JSON.parse(attraction.images);
                return Array.isArray(parsed) ? parsed : [attraction.images];
              } catch {
                return attraction.images ? [attraction.images] : [];
              }
            })()
            : [];
        imageUrls.filter(Boolean).forEach((imageUrl) => {
          const img = document.createElement('img');
          img.className = 'clickable-image';
          img.src = imageUrl;
          img.alt = attraction.name;
          img.title = 'Open full image';
          img.tabIndex = 0;
          img.addEventListener('click', () => window.openImageLightbox?.(imageUrl, attraction.name));
          img.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              window.openImageLightbox?.(imageUrl, attraction.name);
            }
          });
          gallery.appendChild(img);
        });
      }

      if (placeSelect) {
        placeSelect.value = attraction.id;
      }
      selectedUserAttractionId = attraction.id;

      document.querySelectorAll('.attraction-option').forEach((button) => {
        button.classList.toggle('active', button.textContent.includes(attraction.name));
      });

      window.UserDirectionsFeature?.render(attraction);
    }

    window.UserAttractionsFeature.select = selectAttraction;
  }

  window.UserAttractionsFeature = {
    render: renderAttractionsFeature,
    select: null
  };
})();
