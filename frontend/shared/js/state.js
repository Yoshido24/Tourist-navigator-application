// Shared storage configuration and Supabase access
const DB_NAME = 'montalban-navigator-db';
const DB_VERSION = 3;
const STORE_NAMES = {
  attractions: 'attractions',
  bookings: 'bookings',
  guides: 'guides',
  guideApplications: 'guide_applications',
  shopProducts: 'shop_products'
};
const SHOP_CACHE_KEY = 'montalban-navigator-shop-products';
const GUIDE_APPLICATION_CACHE_KEY = 'montalban-navigator-guide-applications';
const ATTRACTION_CACHE_KEY = 'montalban-navigator-attractions';
const BOOKING_CACHE_KEY = 'montalban-navigator-bookings';

const USE_SUPABASE = typeof SUPABASE_URL !== 'undefined' &&
  typeof SUPABASE_ANON_KEY !== 'undefined' &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('your-project-ref') &&
  !SUPABASE_ANON_KEY.includes('your-anon-key');

const supabaseClient = USE_SUPABASE ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

function readLocalShopProducts() {
  try {
    return JSON.parse(window.localStorage.getItem(SHOP_CACHE_KEY) || '[]');
  } catch (error) {
    console.warn('Unable to read the local Mini Shop cache.', error);
    return [];
  }
}

function writeLocalShopProducts(items) {
  try {
    window.localStorage.setItem(SHOP_CACHE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Unable to write the local Mini Shop cache.', error);
  }
}

function readLocalGuideApplications() {
  try {
    return JSON.parse(window.localStorage.getItem(GUIDE_APPLICATION_CACHE_KEY) || '[]');
  } catch (error) {
    console.warn('Unable to read the local guide application cache.', error);
    return [];
  }
}

function writeLocalGuideApplications(items) {
  try {
    window.localStorage.setItem(GUIDE_APPLICATION_CACHE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Unable to write the local guide application cache.', error);
  }
}

function readLocalAttractions() {
  try {
    return JSON.parse(window.localStorage.getItem(ATTRACTION_CACHE_KEY) || '[]');
  } catch (error) {
    console.warn('Unable to read the local attraction cache.', error);
    return [];
  }
}

function writeLocalAttractions(items) {
  try {
    window.localStorage.setItem(ATTRACTION_CACHE_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn('Unable to write the local attraction cache.', error);
  }

  function readLocalBookings() {
    try {
      return JSON.parse(window.localStorage.getItem(BOOKING_CACHE_KEY) || '[]');
    } catch (error) {
      console.warn('Unable to read the local booking cache.', error);
      return [];
    }
  }

  function writeLocalBookings(items) {
    try {
      window.localStorage.setItem(BOOKING_CACHE_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn('Unable to write the local booking cache.', error);
    }
  }
}

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

async function replaceItemsInStore(database, storeName, items) {
  const existingItems = await getAllFromStore(database, storeName);
  const nextIds = new Set(items.map((item) => item.id));
  const removedIds = existingItems
    .map((item) => item.id)
    .filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    await deleteItemsFromStore(database, storeName, removedIds);
  }

  await writeItemsToStore(database, storeName, items);
}

async function fetchOptionalSupabaseTable(tableName) {
  try {
    return await fetchSupabaseTable(tableName);
  } catch (error) {
    console.warn(`Unable to load optional Supabase table "${tableName}".`, error);
    return [];
  }
}

async function persistSupabaseCollection(tableName, items, options = {}) {
  const existing = await fetchSupabaseTable(tableName);
  const nextIds = new Set(items.map((item) => item.id));
  const removedIds = existing
    .map((item) => item.id)
    .filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    const { error } = await supabaseClient.from(tableName).delete().in('id', removedIds);
    if (error) throw error;
  }

  const payload = withCreatedAt(items);
  const result = await supabaseClient.from(tableName).upsert(payload);
  if (!result.error) return result;

  if (options.retryWithout) {
    const fallbackPayload = payload.map((item) => {
      const copy = options.fallbackFields
        ? Object.fromEntries(options.fallbackFields.filter((field) => field in item).map((field) => [field, item[field]]))
        : { ...item };
      options.retryWithout.forEach((field) => delete copy[field]);
      return copy;
    });
    const fallbackResult = await supabaseClient.from(tableName).upsert(fallbackPayload);
    if (!fallbackResult.error) {
      console.warn(`Saved "${tableName}" without unsupported optional fields. Run the latest migration to restore them.`);
    }
    return fallbackResult;
  }

  return result;
}

async function seedSupabaseDataIfEmpty() {
  if (!supabaseClient) {
    return;
  }

  await Promise.all([
    supabaseClient.from(STORE_NAMES.attractions).delete().in('id', ['waterfalls', 'heritage', 'market']),
    supabaseClient.from(STORE_NAMES.bookings).delete().eq('id', 'booking-1'),
    supabaseClient.from(STORE_NAMES.guides).delete().in('id', ['guide-1', 'guide-2'])
  ]);

  const [attractions, bookings, guides, guideApplications, shopProducts] = await Promise.all([
    fetchSupabaseTable(STORE_NAMES.attractions),
    fetchSupabaseTable(STORE_NAMES.bookings),
    fetchSupabaseTable(STORE_NAMES.guides),
    fetchOptionalSupabaseTable(STORE_NAMES.guideApplications),
    fetchOptionalSupabaseTable(STORE_NAMES.shopProducts)
  ]);

  const seedPromises = [];
  if (attractions.length === 0) {
    seedPromises.push(supabaseClient.from(STORE_NAMES.attractions).upsert(withCreatedAt(defaultState.attractions)));
  }
  if (bookings.length === 0) {
    seedPromises.push(supabaseClient.from(STORE_NAMES.bookings).upsert(withCreatedAt(defaultState.bookings)));
  }
  if (guides.length === 0) {
    seedPromises.push(supabaseClient.from(STORE_NAMES.guides).upsert(withCreatedAt(defaultState.guides)));
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
  const [attractions, bookings, guides, guideApplications, shopProducts] = await Promise.all([
    fetchSupabaseTable(STORE_NAMES.attractions),
    fetchSupabaseTable(STORE_NAMES.bookings),
    fetchSupabaseTable(STORE_NAMES.guides),
    fetchOptionalSupabaseTable(STORE_NAMES.guideApplications),
    fetchOptionalSupabaseTable(STORE_NAMES.shopProducts)
  ]);
  const cachedShopProducts = readLocalShopProducts();
  const localAttractions = readLocalAttractions();
  const localGuideApplications = readLocalGuideApplications();
  const localAttractionById = new Map(localAttractions.map((item) => [item.id, item]));
  const mergedAttractions = attractions.map((attraction) => {
    const local = localAttractionById.get(attraction.id);
    return local && (!Array.isArray(attraction.transportOptions) || !attraction.transportOptions.length)
      ? { ...local, ...attraction, transportOptions: local.transportOptions || [] }
      : attraction;
  });

  const localBookings = readLocalBookings();
  const localBookingById = new Map(localBookings.map((item) => [item.id, item]));
  const mergedBookings = bookings.map((booking) => ({ ...localBookingById.get(booking.id), ...booking }));
  localBookings.forEach((booking) => {
    if (!mergedBookings.some((item) => item.id === booking.id)) mergedBookings.push(booking);
  });

  return {
    attractions: mergedAttractions.length ? mergedAttractions : (localAttractions.length ? localAttractions : defaultState.attractions),
    bookings: mergedBookings.length ? mergedBookings.map(normalizeBooking) : defaultState.bookings,
    guides: guides.length ? guides : defaultState.guides,
    guideApplications: guideApplications.length ? guideApplications : (localGuideApplications.length ? localGuideApplications : defaultState.guideApplications),
    shopProducts: shopProducts.length ? shopProducts : (cachedShopProducts.length ? cachedShopProducts : defaultState.shopProducts)
  };
}

async function persistStateToSupabase(state) {
  if (!supabaseClient) {
    return state;
  }

  writeLocalGuideApplications(state.guideApplications || []);
  writeLocalAttractions(state.attractions || []);
  writeLocalBookings(state.bookings || []);
  writeLocalShopProducts(state.shopProducts || []);
  writeLocalGuideApplications(state.guideApplications || []);

  const [attractionsResult, bookingsResult, guidesResult, guideApplicationsResult, shopProductsResult] = await Promise.all([
    persistSupabaseCollection(STORE_NAMES.attractions, state.attractions, {
      retryWithout: ['transportOptions']
    }),
    persistSupabaseCollection(STORE_NAMES.bookings, state.bookings, {
      retryWithout: ['time', 'meetingPoint', 'scheduleNotes', 'contact', 'adults', 'kids', 'pwd', 'created_at'],
      fallbackFields: ['id', 'attractionId', 'attractionName', 'travelerName', 'date', 'notes', 'status', 'assignedGuide']
    }),
    persistSupabaseCollection(STORE_NAMES.guides, state.guides, {
      retryWithout: ['email', 'password']
    }),
    persistSupabaseCollection(STORE_NAMES.guideApplications, state.guideApplications || [], {
      retryWithout: ['email', 'password']
    }).catch((error) => ({ error })),
    persistSupabaseCollection(STORE_NAMES.shopProducts, state.shopProducts || []).catch((error) => ({
      error
    }))
  ]);

  if (attractionsResult.error || bookingsResult.error || guidesResult.error) {
    console.warn('Supabase save failed', attractionsResult.error || bookingsResult.error || guidesResult.error);
  }
  if (shopProductsResult.error) {
    console.warn('Optional shop product save failed. Run the shop_products migration to enable it.', shopProductsResult.error);
  }
  if (guideApplicationsResult.error) {
    console.warn('Guide applications are stored locally until the guide_applications migration is run.', guideApplicationsResult.error);
  }
  if (attractionsResult.error || bookingsResult.error || guidesResult.error) {
    return state;
  }

  return state;
}

// The shared application data contract. Every portal reads and writes this shape.
const defaultState = {
  attractions: [],
  bookings: [],
  guides: [],
  guideApplications: [],
  shopProducts: []
};
let dbConnection = null;
let appState = null;
let touristMapInstance = null;
let adminMapInstance = null;
let selectAdminAttraction = null;
let selectedUserAttractionId = null;

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function normalizeBooking(booking) {
  const party = booking.party || {};
  const rawStatus = String(booking.status || 'Pending').toLowerCase();
  const status = rawStatus === 'completed'
    ? 'Completed'
    : ['approved', 'assigned', 'confirmed'].includes(rawStatus)
      ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1)
      : 'Pending';
  return {
    ...booking,
    status,
    contact: booking.contact || booking.contactNumber || booking.phone || '',
    adults: Number(booking.adults ?? party.adults ?? 0),
    kids: Number(booking.kids ?? party.kids ?? party.children ?? 0),
    pwd: Number(booking.pwd ?? party.pwd ?? 0)
  };
}

function withCreatedAt(items) {
  const timestamp = new Date().toISOString();
  return items.map((item) => ({
    ...item,
    created_at: item.created_at || timestamp
  }));
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
      if (!database.objectStoreNames.contains(STORE_NAMES.guideApplications)) {
        database.createObjectStore(STORE_NAMES.guideApplications, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(STORE_NAMES.shopProducts)) {
        database.createObjectStore(STORE_NAMES.shopProducts, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        if (dbConnection === database) dbConnection = null;
      };
      resolve(database);
    };
    request.onblocked = () => {
      console.warn('Waiting for another portal to release the shared database connection.');
    };
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
  if (!database.objectStoreNames.contains(storeName)) {
    return Promise.resolve([]);
  }
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

function deleteItemsFromStore(database, storeName, ids) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    ids.forEach((id) => store.delete(id));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function seedDatabase() {}

// Load, save, and update state for every portal
async function loadState() {
  try {
    if (USE_SUPABASE) {
      return await loadStateFromSupabase();
    }

    const database = await getDatabase();
    await Promise.all([
      deleteItemsFromStore(database, STORE_NAMES.attractions, ['waterfalls', 'heritage', 'market']),
      deleteItemsFromStore(database, STORE_NAMES.bookings, ['booking-1']),
      deleteItemsFromStore(database, STORE_NAMES.guides, ['guide-1', 'guide-2']),
      deleteItemsFromStore(database, STORE_NAMES.shopProducts, ['shop-basket', 'shop-snacks'])
    ]);
    await seedDatabase(database);
    const [attractions, bookings, guides, guideApplications, shopProducts] = await Promise.all([
      getAllFromStore(database, STORE_NAMES.attractions),
      getAllFromStore(database, STORE_NAMES.bookings),
      getAllFromStore(database, STORE_NAMES.guides),
      getAllFromStore(database, STORE_NAMES.guideApplications),
      getAllFromStore(database, STORE_NAMES.shopProducts)
    ]);

    return {
      attractions: attractions.length ? attractions : defaultState.attractions,
      bookings: bookings.length ? bookings.map(normalizeBooking) : defaultState.bookings,
      guides: guides.length ? guides : defaultState.guides,
      guideApplications: guideApplications.length ? guideApplications : defaultState.guideApplications,
      shopProducts: shopProducts.length ? shopProducts : defaultState.shopProducts
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
      replaceItemsInStore(database, STORE_NAMES.attractions, state.attractions),
      replaceItemsInStore(database, STORE_NAMES.bookings, state.bookings),
      replaceItemsInStore(database, STORE_NAMES.guides, state.guides),
      replaceItemsInStore(database, STORE_NAMES.guideApplications, state.guideApplications || []),
      replaceItemsInStore(database, STORE_NAMES.shopProducts, state.shopProducts || [])
    ]);
    writeLocalBookings(state.bookings || []);
    writeLocalGuideApplications(state.guideApplications || []);
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

// Booking payload creation shared by the tourist booking flow
function createBookingFromForm(form) {
  const formData = new FormData(form);
  const attractionId = formData.get('place') || '';
  const attraction = (appState || defaultState).attractions.find((item) => item.id === attractionId) || (appState || defaultState).attractions[0];
  if (!attraction) {
    throw new Error('At least one published attraction is required before creating a booking.');
  }

  return {
    id: `booking-${Date.now()}`,
    attractionId: attraction.id,
    attractionName: attraction.name,
    travelerName: formData.get('name') || 'Guest',
    contact: formData.get('contact') || '',
    adults: Number(formData.get('adults') || 0),
    kids: Number(formData.get('kids') || 0),
    pwd: Number(formData.get('pwd') || 0),
    date: formData.get('date') || new Date().toISOString().slice(0, 10),
    time: formData.get('time') || '',
    notes: formData.get('notes') || '',
    status: 'Pending'
  };
}
