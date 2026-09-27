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
const ATTRACTION_CACHE_KEY = 'montalban-navigator-attractions';

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
  // Use the optional fetch so a missing/not-yet-migrated table doesn't block the upsert below.
  const existing = await fetchOptionalSupabaseTable(tableName);
  const nextIds = new Set(items.map((item) => item.id));
  const removedIds = existing
    .map((item) => item.id)
    .filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    const { error } = await supabaseClient.from(tableName).delete().in('id', removedIds);
    if (error) console.warn(`Unable to remove stale rows from "${tableName}".`, error);
  }

  const payload = withCreatedAt(items);

  // Only drop columns PostgREST actually reports as missing, one at a time, so a single
  // unmigrated column (e.g. meetingPoint) never wipes out unrelated fields (e.g. contact).
  const droppedFields = [];
  let attemptPayload = payload;
  let result;
  for (let attempt = 0; attempt < (options.retryWithout || []).length + 1; attempt += 1) {
    result = await supabaseClient.from(tableName).upsert(attemptPayload);
    if (!result.error) {
      if (droppedFields.length) {
        console.warn(`Saved "${tableName}" without unsupported optional field(s): ${droppedFields.join(', ')}. Run the latest migration to restore them.`);
      }
      return result;
    }

    const missingField = /Could not find the '([^']+)' column/.exec(result.error.message || '')?.[1];
    const fieldToDrop = missingField && (options.retryWithout || []).includes(missingField)
      ? missingField
      : null;
    if (!fieldToDrop) break;

    droppedFields.push(fieldToDrop);
    attemptPayload = attemptPayload.map((item) => {
      const copy = { ...item };
      delete copy[fieldToDrop];
      return copy;
    });
  }

  return result;
}

async function seedSupabaseDataIfEmpty() {
  if (!supabaseClient) {
    return;
  }

  await Promise.all([
    supabaseClient.from(STORE_NAMES.attractions).delete().in('id', ['waterfalls', 'heritage', 'market']),
    supabaseClient.from(STORE_NAMES.guides).delete().in('id', ['guide-1', 'guide-2'])
  ]);

  const [attractions, bookings, guides, guideApplications, shopProducts] = await Promise.all([
    fetchSupabaseTable(STORE_NAMES.attractions),
    fetchSupabaseTable(STORE_NAMES.bookings),
    fetchSupabaseTable(STORE_NAMES.guides),
    fetchSupabaseTable(STORE_NAMES.guideApplications),
    fetchOptionalSupabaseTable(STORE_NAMES.shopProducts)
  ]);

  const seedPromises = [];
  if (attractions.length === 0) {
    seedPromises.push(supabaseClient.from(STORE_NAMES.attractions).upsert(withCreatedAt(defaultState.attractions)));
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
    fetchSupabaseTable(STORE_NAMES.guideApplications),
    fetchOptionalSupabaseTable(STORE_NAMES.shopProducts)
  ]);
  const cachedShopProducts = readLocalShopProducts();
  const localAttractions = readLocalAttractions();
  const localAttractionById = new Map(localAttractions.map((item) => [item.id, item]));
  const mergedAttractions = attractions.map((attraction) => {
    const local = localAttractionById.get(attraction.id);
    return local && (!Array.isArray(attraction.transportOptions) || !attraction.transportOptions.length)
      ? { ...local, ...attraction, transportOptions: local.transportOptions || [] }
      : attraction;
  });

  return {
    attractions: mergedAttractions.length ? mergedAttractions : (localAttractions.length ? localAttractions : defaultState.attractions),
    bookings: bookings.map(normalizeBooking),
    guides: guides.length ? guides : defaultState.guides,
    guideApplications,
    shopProducts: shopProducts.length ? shopProducts : (cachedShopProducts.length ? cachedShopProducts : defaultState.shopProducts)
  };
}

async function persistStateToSupabase(state) {
  if (!supabaseClient) {
    return state;
  }

  writeLocalAttractions(state.attractions || []);
  writeLocalShopProducts(state.shopProducts || []);

  const previousState = appState || {};
  const changed = (collection) => JSON.stringify(previousState[collection] || []) !== JSON.stringify(state[collection] || []);
  const [attractionsResult, bookingsResult, guidesResult, guideApplicationsResult, shopProductsResult] = await Promise.all([
    changed('attractions') ? persistSupabaseCollection(STORE_NAMES.attractions, state.attractions, {
      retryWithout: ['transportOptions']
    }) : { error: null },
    changed('bookings') ? persistSupabaseCollection(STORE_NAMES.bookings, state.bookings, {
      retryWithout: ['time', 'meetingPoint', 'scheduleNotes', 'contact', 'adults', 'kids', 'pwd', 'guideNote', 'created_at']
    }) : { error: null },
    changed('guides') ? persistSupabaseCollection(STORE_NAMES.guides, state.guides, {
      retryWithout: ['email', 'password', 'address', 'idNumber', 'experience']
    }) : { error: null },
    changed('guideApplications') ? persistSupabaseCollection(STORE_NAMES.guideApplications, state.guideApplications || [], {
      retryWithout: ['email', 'password', 'address', 'idNumber', 'experience', 'interviewDate', 'interviewTime', 'interviewLocation']
    }).catch((error) => ({ error })) : { error: null },
    changed('shopProducts') ? persistSupabaseCollection(STORE_NAMES.shopProducts, state.shopProducts || []).catch((error) => ({
      error
    })) : { error: null }
  ]);

  if (attractionsResult.error || bookingsResult.error || guidesResult.error) {
    console.warn('Supabase save failed', attractionsResult.error || bookingsResult.error || guidesResult.error);
  }
  if (shopProductsResult.error) {
    console.warn('Optional shop product save failed. Run the shop_products migration to enable it.', shopProductsResult.error);
  }
  if (guideApplicationsResult.error) {
    console.warn('Guide application save failed. Run the guide_applications migration and check Supabase permissions.', guideApplicationsResult.error);
  }
  // Let callers (e.g. the guide sign-up form) know whether the shared save actually reached Supabase.
  window.lastSyncErrors = {
    attractions: attractionsResult.error || null,
    bookings: bookingsResult.error || null,
    guides: guidesResult.error || null,
    guideApplications: guideApplicationsResult.error || null,
    shopProducts: shopProductsResult.error || null
  };
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
    : ['approved', 'assigned', 'confirmed', 'ongoing'].includes(rawStatus)
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
  // Pages without a portal.js (e.g. the guide login/sign-up forms) don't define renderApp.
  if (typeof renderApp === 'function') {
    await renderApp(savedState);
  }
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
