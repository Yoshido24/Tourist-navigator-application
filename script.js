const DB_NAME = 'montalban-navigator-db';
const DB_VERSION = 1;
const STORE_NAMES = {
  attractions: 'attractions',
  bookings: 'bookings',
  guides: 'guides'
};

const USE_SUPABASE = typeof SUPABASE_URL !== 'undefined' &&
  typeof SUPABASE_ANON_KEY !== 'undefined' &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('your-project-ref') &&
  !SUPABASE_ANON_KEY.includes('your-anon-key');

const supabaseClient = USE_SUPABASE ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

async function fetchSupabaseTable(tableName) {
  if (!supabaseClient) {
    return [];
  }

  const { data, error } = await supabaseClient.from(tableName).select('*');
  if (error) {
    throw error;
  }
  return data || [];
}

async function seedSupabaseDataIfEmpty() {
  if (!supabaseClient) {
    return;
  }

  const [attractions, bookings, guides] = await Promise.all([
    fetchSupabaseTable(STORE_NAMES.attractions),
    fetchSupabaseTable(STORE_NAMES.bookings),
    fetchSupabaseTable(STORE_NAMES.guides)
  ]);

  const seedPromises = [];
  if (attractions.length === 0) {
    seedPromises.push(supabaseClient.from(STORE_NAMES.attractions).upsert(defaultState.attractions));
  }
  if (bookings.length === 0) {
    seedPromises.push(supabaseClient.from(STORE_NAMES.bookings).upsert(defaultState.bookings));
  }
  if (guides.length === 0) {
    seedPromises.push(supabaseClient.from(STORE_NAMES.guides).upsert(defaultState.guides));
  }

  if (seedPromises.length > 0) {
    const results = await Promise.all(seedPromises);
    for (const result of results) {
      if (result.error) {
        throw result.error;
      }
    }
  }
}

async function loadStateFromSupabase() {
  await seedSupabaseDataIfEmpty();
  const [attractions, bookings, guides] = await Promise.all([
    fetchSupabaseTable(STORE_NAMES.attractions),
    fetchSupabaseTable(STORE_NAMES.bookings),
    fetchSupabaseTable(STORE_NAMES.guides)
  ]);

  return {
    attractions: attractions.length ? attractions : defaultState.attractions,
    bookings: bookings.length ? bookings : defaultState.bookings,
    guides: guides.length ? guides : defaultState.guides
  };
}

async function persistStateToSupabase(state) {
  if (!supabaseClient) {
    return state;
  }

  const [attractionsResult, bookingsResult, guidesResult] = await Promise.all([
    supabaseClient.from(STORE_NAMES.attractions).upsert(state.attractions),
    supabaseClient.from(STORE_NAMES.bookings).upsert(state.bookings),
    supabaseClient.from(STORE_NAMES.guides).upsert(state.guides)
  ]);

  if (attractionsResult.error || bookingsResult.error || guidesResult.error) {
    console.warn('Supabase save failed', attractionsResult.error || bookingsResult.error || guidesResult.error);
    return state;
  }

  return state;
}

const defaultState = {
  attractions: [
    {
      id: 'waterfalls',
      name: 'Montalban Waterfalls',
      fee: '₱50',
      duration: '2-3 hours',
      description: 'A scenic nature stop with walking paths, photo spots, and a calm guide-led visit.',
      expectations: 'Expect a cool breeze, short hiking, and plenty of photo stops along the trail.',
      terrain: 'Mostly gentle walking paths with some rocky sections and stairs.',
      startPoint: 'Main entrance gate near the tourism office in Rodriguez, Rizal.',
      images: ['https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=80', 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80'],
      guideAvailable: true,
      category: 'Nature',
      position: { x: 26, y: 34 },
      directions: 'https://www.google.com/maps/dir/?api=1&destination=14.73,121.15'
    },
    {
      id: 'heritage',
      name: 'Heritage Trail',
      fee: '₱80',
      duration: '1-2 hours',
      description: 'A cultural walk featuring local landmarks, history, and community stories.',
      expectations: 'Expect guided storytelling, quiet heritage stops, and local culture insights.',
      terrain: 'Easy walking on paved and compact dirt paths.',
      startPoint: 'Town plaza beside the old market entrance.',
      images: ['https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80'],
      guideAvailable: true,
      category: 'Culture',
      position: { x: 64, y: 48 },
      directions: 'https://www.google.com/maps/dir/?api=1&destination=14.74,121.18'
    },
    {
      id: 'market',
      name: 'Local Market',
      fee: 'Free',
      duration: '1 hour',
      description: 'Browse food, crafts, and local treats before or after your main tour.',
      expectations: 'Expect local snacks, handmade goods, and a lively community atmosphere.',
      terrain: 'Flat terrain with easy walking between stalls.',
      startPoint: 'Market gate near the main road and parking area.',
      images: ['https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'],
      guideAvailable: false,
      category: 'Shopping',
      position: { x: 72, y: 24 },
      directions: 'https://www.google.com/maps/dir/?api=1&destination=14.72,121.17'
    }
  ],
  bookings: [
    {
      id: 'booking-1',
      attractionId: 'waterfalls',
      attractionName: 'Montalban Waterfalls',
      travelerName: 'Maria',
      date: '2026-07-20',
      notes: 'Family visit',
      status: 'Confirmed'
    }
  ],
  guides: [
    {
      id: 'guide-1',
      name: 'Alicia Reyes',
      specialty: 'Nature walks',
      contact: '0917-101-2001',
      availability: 'Weekends'
    },
    {
      id: 'guide-2',
      name: 'Leo Santos',
      specialty: 'Heritage tours',
      contact: '0917-202-3002',
      availability: 'Daily'
    }
  ]
};

let dbConnection = null;
let appState = null;

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function getFallbackState() {
  return cloneState(defaultState);
}

function openDatabase() {
  if (!window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAMES.attractions)) {
        database.createObjectStore(STORE_NAMES.attractions, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_NAMES.bookings)) {
        database.createObjectStore(STORE_NAMES.bookings, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_NAMES.guides)) {
        database.createObjectStore(STORE_NAMES.guides, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getDatabase() {
  if (!dbConnection) {
    dbConnection = await openDatabase();
  }
  return dbConnection;
}

function getAllFromStore(database, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeItemsToStore(database, storeName, items) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);

    items.forEach((item) => store.put(item));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function seedDatabase(database) {
  const [attractions, bookings, guides] = await Promise.all([
    getAllFromStore(database, STORE_NAMES.attractions),
    getAllFromStore(database, STORE_NAMES.bookings),
    getAllFromStore(database, STORE_NAMES.guides)
  ]);

  if (attractions.length === 0 || bookings.length === 0 || guides.length === 0) {
    await Promise.all([
      writeItemsToStore(database, STORE_NAMES.attractions, defaultState.attractions),
      writeItemsToStore(database, STORE_NAMES.bookings, defaultState.bookings),
      writeItemsToStore(database, STORE_NAMES.guides, defaultState.guides)
    ]);
  }
}

async function loadState() {
  try {
    if (USE_SUPABASE) {
      return await loadStateFromSupabase();
    }

    const database = await getDatabase();
    await seedDatabase(database);
    const [attractions, bookings, guides] = await Promise.all([
      getAllFromStore(database, STORE_NAMES.attractions),
      getAllFromStore(database, STORE_NAMES.bookings),
      getAllFromStore(database, STORE_NAMES.guides)
    ]);

    return {
      attractions: attractions.length ? attractions : defaultState.attractions,
      bookings: bookings.length ? bookings : defaultState.bookings,
      guides: guides.length ? guides : defaultState.guides
    };
  } catch (error) {
    console.warn('Unable to read the shared database. Using fallback data.', error);
    return getFallbackState();
  }
}

async function persistState(state) {
  try {
    if (USE_SUPABASE) {
      return await persistStateToSupabase(state);
    }

    const database = await getDatabase();
    await Promise.all([
      writeItemsToStore(database, STORE_NAMES.attractions, state.attractions),
      writeItemsToStore(database, STORE_NAMES.bookings, state.bookings),
      writeItemsToStore(database, STORE_NAMES.guides, state.guides)
    ]);
    return state;
  } catch (error) {
    console.warn('Unable to save the shared database.', error);
    return state;
  }
}

async function updateState(updater) {
  const currentState = appState || (await loadState());
  const nextState = updater(currentState);
  const savedState = await persistState(nextState);
  appState = savedState;
  await renderApp(savedState);
  return savedState;
}

function createBookingFromForm(form) {
  const formData = new FormData(form);
  const attractionId = formData.get('place') || 'waterfalls';
  const attraction = (appState || defaultState).attractions.find((item) => item.id === attractionId) || (appState || defaultState).attractions[0];

  return {
    id: `booking-${Date.now()}`,
    attractionId,
    attractionName: attraction.name,
    travelerName: formData.get('name') || 'Guest',
    date: formData.get('date') || new Date().toISOString().slice(0, 10),
    notes: formData.get('notes') || '',
    status: 'Pending'
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAttractionCoords(attraction) {
  if (Array.isArray(attraction.coords) && attraction.coords.length === 2) {
    return attraction.coords;
  }

  if (attraction.position && typeof attraction.position.x === 'number' && typeof attraction.position.y === 'number') {
    const lat = 14.73 + (attraction.position.y / 100) * 0.03;
    const lng = 121.15 + (attraction.position.x / 100) * 0.05;
    return [lat, lng];
  }

  return [14.73, 121.15];
}

function renderUserPage(state) {
  const attractionsList = document.getElementById('attraction-selector');
  const selectedName = document.getElementById('selected-attraction-name');
  const selectedDescription = document.getElementById('selected-attraction-description');
  const selectedExpectations = document.getElementById('selected-attraction-expectations');
  const selectedTerrain = document.getElementById('selected-attraction-terrain');
  const selectedStartPoint = document.getElementById('selected-attraction-startpoint');
  const gallery = document.getElementById('attraction-gallery');
  const directionsSummary = document.getElementById('directions-summary');
  const directionsMap = document.getElementById('directions-map');
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
        renderAttractionDetails(attraction, state);
      });
      attractionsList.appendChild(button);
    });
  }

  if (placeSelect) {
    placeSelect.innerHTML = '';
    state.attractions.forEach((attraction) => {
      const option = document.createElement('option');
      option.value = attraction.id;
      option.textContent = attraction.name;
      placeSelect.appendChild(option);
    });
  }

  if (state.attractions.length > 0) {
    renderAttractionDetails(state.attractions[0], state);
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
      directionsSummary.textContent = `${attraction.name}: ${attraction.startPoint || 'Meet at the designated starting point.'}`;
    }
    if (directionsMap) {
      directionsMap.src = attraction.directions || 'https://www.google.com/maps?q=Rodriguez,Rizal&output=embed';
    }

    if (placeSelect) {
      placeSelect.value = attraction.id;
    }

    document.querySelectorAll('.attraction-option').forEach((button) => {
      button.classList.toggle('active', button.textContent.includes(attraction.name));
    });
  }
}

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

  let editingId = null;
  let draftMarker = null;

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
  });

  resetButton?.addEventListener('click', () => {
    populateForm(null);
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
      fee: formData.get('fee') || '₱0',
      duration: formData.get('duration') || '1 hour',
      description: formData.get('description') || 'Added from admin dashboard.',
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
  });
}

function renderGuidePage(state) {
  const guideInfoList = document.getElementById('guide-info-list');
  if (guideInfoList) {
    guideInfoList.innerHTML = '';
    state.guides.forEach((guide) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${guide.name}</h3>
        <p><strong>Specialty:</strong> ${guide.specialty}</p>
        <p><strong>Contact:</strong> ${guide.contact}</p>
        <p><strong>Availability:</strong> ${guide.availability}</p>
      `;
      guideInfoList.appendChild(card);
    });
  }

  const bookingList = document.getElementById('guide-bookings-list');
  if (bookingList) {
    bookingList.innerHTML = '';
    state.bookings.forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${booking.attractionName}</h3>
        <p><strong>Traveler:</strong> ${booking.travelerName}</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
        <p>${booking.notes}</p>
        <div class="filter-row">
          <button class="btn btn-secondary" type="button" data-booking-status="Confirmed">Confirm</button>
          <button class="btn btn-primary" type="button" data-booking-status="Completed">Complete</button>
        </div>
      `;
      card.querySelector('[data-booking-status="Confirmed"]').addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (item.id === booking.id ? { ...item, status: 'Confirmed' } : item))
        }));
      });
      card.querySelector('[data-booking-status="Completed"]').addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (item.id === booking.id ? { ...item, status: 'Completed' } : item))
        }));
      });
      bookingList.appendChild(card);
    });
  }

  const visitorList = document.getElementById('guide-visitors-list');
  if (visitorList) {
    visitorList.innerHTML = '';
    state.bookings.slice(0, 3).forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${booking.travelerName}</h3>
        <p>${booking.attractionName}</p>
        <p>${booking.date}</p>
        <p>${booking.status}</p>
      `;
      visitorList.appendChild(card);
    });
  }
}

function initMap() {
  const mapElement = document.getElementById('map');
  const detailsElement = document.getElementById('attraction-details');

  if (!mapElement) {
    return;
  }

  mapElement.style.height = '320px';

  const attractions = [
    {
      name: 'Montalban Waterfalls',
      lat: 14.7311,
      lng: 121.1492,
      category: 'Nature',
      fee: '₱50',
      duration: '2-3 hours',
      image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=800&q=80',
      details: 'A scenic nature stop with walking paths, photo spots, and a calm guide-led visit.'
    },
    {
      name: 'Heritage Trail',
      lat: 14.7396,
      lng: 121.1833,
      category: 'Culture',
      fee: '₱80',
      duration: '1-2 hours',
      image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=800&q=80',
      details: 'A cultural walk featuring local landmarks, history, and community stories.'
    },
    {
      name: 'Local Market',
      lat: 14.7222,
      lng: 121.1711,
      category: 'Shopping',
      fee: 'Free',
      duration: '1 hour',
      image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      details: 'Browse food, crafts, and local treats before or after your main tour.'
    }
  ];

  const showDetails = (attraction) => {
    if (!detailsElement) {
      return;
    }

    detailsElement.innerHTML = `
      <h3>${attraction.name}</h3>
      <img src="${attraction.image}" alt="${attraction.name}" />
      <p><strong>${attraction.category}</strong> • ${attraction.fee}</p>
      <p>${attraction.details}</p>
      <p><strong>Duration:</strong> ${attraction.duration}</p>
    `;
  };

  if (window.L && typeof window.L.map === 'function') {
    const map = window.L.map(mapElement).setView([14.73, 121.16], 12);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    attractions.forEach((attraction) => {
      const marker = window.L.marker([attraction.lat, attraction.lng]).addTo(map);
      marker.bindPopup(`<strong>${attraction.name}</strong><br>${attraction.category}`);
      marker.on('click', () => showDetails(attraction));
      marker.on('mouseover', () => showDetails(attraction));
    });

    if (attractions.length > 0) {
      showDetails(attractions[0]);
    }
    return;
  }

  if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
    const map = new google.maps.Map(mapElement, {
      center: { lat: 14.73, lng: 121.16 },
      zoom: 12,
    });

    attractions.forEach((attraction) => {
      const marker = new google.maps.Marker({
        position: { lat: attraction.lat, lng: attraction.lng },
        map,
        title: attraction.name,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div class="popup">
            <h3>${attraction.name}</h3>
            <img src="${attraction.image}" alt="${attraction.name}" />
            <p>${attraction.details}</p>
          </div>
        `
      });

      marker.addListener('click', () => {
        infoWindow.open({ anchor: marker, map });
        showDetails(attraction);
      });
    });

    if (attractions.length > 0) {
      showDetails(attractions[0]);
    }
    return;
  }

  if (detailsElement) {
    detailsElement.innerHTML = '<p>A map will appear here once the map library is available.</p>';
  }
}

window.addEventListener('load', initMap);

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

  const occupancy = document.getElementById('stat-occupancy');
  if (occupancy) {
    const percent = Math.min(99, Math.max(70, state.bookings.length * 15 + 40));
    occupancy.textContent = `${percent}%`;
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
        <p><strong>Fee:</strong> ${attraction.fee} • <strong>Duration:</strong> ${attraction.duration}</p>
      `;
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

  const adminBookingsList = document.getElementById('admin-bookings-list');
  if (adminBookingsList) {
    adminBookingsList.innerHTML = '';
    state.bookings.forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${booking.attractionName}</h3>
        <p><strong>Traveler:</strong> ${booking.travelerName}</p>
        <p><strong>Date:</strong> ${booking.date}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
        <p><strong>Guide:</strong> ${booking.assignedGuide || 'Not assigned yet'}</p>
        <p>${booking.notes}</p>
        <div class="filter-row">
          <button class="btn btn-secondary" type="button" data-booking-action="approve">Approve</button>
          <select class="booking-form-input" data-guide-select>
            <option value="">Select guide</option>
            ${state.guides.map((guide) => `<option value="${guide.name}">${guide.name}</option>`).join('')}
          </select>
          <button class="btn btn-primary" type="button" data-booking-action="assign">Assign guide</button>
        </div>
        ${booking.assignedGuide ? '<a class="btn btn-secondary" href="guide.html">Open guide view</a>' : ''}
      `;

      card.querySelector('[data-booking-action="approve"]').addEventListener('click', async () => {
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

      adminBookingsList.appendChild(card);
    });
  }
}

async function renderApp(state) {
  if (document.getElementById('user-attractions-list') || document.getElementById('place')) {
    renderUserPage(state);
  }
  if (document.getElementById('guide-info-list') || document.getElementById('guide-bookings-list') || document.getElementById('guide-visitors-list')) {
    renderGuidePage(state);
  }
  if (document.getElementById('stat-bookings') || document.getElementById('admin-attractions-list') || document.getElementById('admin-guides-list') || document.getElementById('admin-bookings-list')) {
    renderAdminPage(state);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const year = document.getElementById('year');
  if (year) {
    year.textContent = new Date().getFullYear();
  }

  document.querySelectorAll('[data-scroll-target]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const targetId = button.getAttribute('data-scroll-target');
      const target = document.getElementById(targetId);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  const bookingForm = document.getElementById('booking-form');
  const bookingSuccess = document.getElementById('booking-success');
  if (bookingForm && bookingSuccess) {
    bookingForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const newBooking = createBookingFromForm(bookingForm);
      await updateState((currentState) => ({
        ...currentState,
        bookings: [newBooking, ...currentState.bookings]
      }));
      bookingSuccess.hidden = false;
      bookingSuccess.textContent = `Booking confirmed for ${newBooking.attractionName}. Guide details will appear for the team.`;
      bookingSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }


  const addGuideForm = document.getElementById('add-guide-form');
  if (addGuideForm) {
    addGuideForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(addGuideForm);
      const newGuide = {
        id: `guide-${Date.now()}`,
        name: formData.get('name') || 'New Guide',
        specialty: formData.get('specialty') || 'General tours',
        contact: formData.get('contact') || 'N/A',
        availability: formData.get('availability') || 'Flexible'
      };
      await updateState((currentState) => ({
        ...currentState,
        guides: [newGuide, ...currentState.guides]
      }));
      addGuideForm.reset();
    });
  }

  appState = await loadState();
  await renderApp(appState);
});
