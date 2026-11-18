// Tourist attraction discovery: list, detail panel, and Book form sync
(function () {
  let activeCategory = 'all';
  let currentState;

  function filterAttractionsByCategory(attractions, category) {
    const selectedCategory = String(category || 'all').trim().toLowerCase();
    if (selectedCategory === 'all') return attractions;
    return attractions.filter((attraction) => String(attraction.category || '').trim().toLowerCase() === selectedCategory);
  }

  function renderAttractionsFeature(state) {
    currentState = state;
    const attractions = state.attractions || [];
    const attractionsList = document.getElementById('attraction-selector');
    const selectedName = document.getElementById('selected-attraction-name');
    const selectedDescription = document.getElementById('selected-attraction-description');
    const selectedExpectations = document.getElementById('selected-attraction-expectations');
    const selectedTerrain = document.getElementById('selected-attraction-terrain');
    const selectedStartPoint = document.getElementById('selected-attraction-startpoint');
    const selectedTrail = document.getElementById('selected-attraction-trail');
    const gallery = document.getElementById('attraction-gallery');
    const placeSelect = document.getElementById('place');
    const renderList = () => {
      if (!attractionsList) return;
      attractionsList.innerHTML = '';
      const visibleAttractions = filterAttractionsByCategory(attractions, activeCategory);
      visibleAttractions.forEach((attraction) => {
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
      if (!visibleAttractions.length) {
        attractionsList.innerHTML = activeCategory === 'resort'
          ? '<p class="empty-state">Resorts are available in the Resorts tab.</p>'
          : '<p class="empty-state">No attractions in this category yet.</p>';
      }
    };

    const categories = [
      { value: 'all', label: 'All' },
      ...(window.ATTRACTION_CATEGORIES || []).map((category) => ({ value: category.trim().toLowerCase(), label: category })),
      { value: 'resort', label: 'Resort' }
    ];
    const knownCategories = new Set(categories.map((category) => category.value));
    attractions.forEach((attraction) => {
      const label = String(attraction.category || '').trim();
      const value = label.toLowerCase();
      if (value && !knownCategories.has(value)) {
        knownCategories.add(value);
        categories.push({ value, label });
      }
    });
    const categoryFilters = Array.from(document.querySelectorAll('[data-attraction-category]'));
    if (!categories.some((category) => category.value === activeCategory)) activeCategory = 'all';
    categoryFilters.forEach((filter) => {
      filter.innerHTML = categories.map((category) =>
        `<option value="${escapeHtml(category.value)}">${escapeHtml(category.label)}</option>`
      ).join('');
      filter.value = activeCategory;
      if (filter.dataset.categoryFilterBound === 'true') return;
      filter.dataset.categoryFilterBound = 'true';
      filter.addEventListener('change', () => {
        activeCategory = filter.value;
        renderAttractionsFeature(currentState);
        window.UserMapFeature?.render(currentState);
      });
    });

    if (attractionsList) {
      renderList();
    }

    if (placeSelect) {
      const previousSelection = selectedUserAttractionId || placeSelect.value;
      placeSelect.innerHTML = '';
      attractions.forEach((attraction) => {
        const option = document.createElement('option');
        option.value = attraction.id;
        option.textContent = attraction.name;
        placeSelect.appendChild(option);
      });
      placeSelect.value = attractions.some((item) => item.id === previousSelection)
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

    const preservedAttraction = attractions.find((item) => item.id === selectedUserAttractionId);
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
    select: null,
    filterByCategory: filterAttractionsByCategory,
    getActiveCategory: () => activeCategory
  };
})();
