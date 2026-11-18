// Shared storage configuration and Supabase access
const DB_NAME = 'montalban-navigator-db';
const DB_VERSION = 3;
const STORE_NAMES = {
  attractions: 'attractions',
  bookings: 'bookings',
  guides: 'guides',
  guideApplications: 'guide_applications',
  shopProducts: 'shop_products',
  announcements: 'announcements',
  showcases: 'showcases',
  resorts: 'public_resorts',
  barangays: 'barangays'
};
const SHOP_CACHE_KEY = 'montalban-navigator-shop-products';
const ATTRACTION_CACHE_KEY = 'montalban-navigator-attractions';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function getFunctionErrorMessage(data, error, fallback) {
  let message = data?.error || error?.message || fallback;
  if (error?.context?.headers?.get('content-type')?.includes('application/json')) {
    try {
      const response = await error.context.json();
      if (typeof response?.error === 'string' && response.error) message = response.error;
    } catch (parseError) {
      console.error('Could not read the function error response.', parseError);
    }
  }
  return message;
}

const USE_SUPABASE = typeof SUPABASE_URL !== 'undefined' &&
  typeof SUPABASE_ANON_KEY !== 'undefined' &&
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  !SUPABASE_URL.includes('your-project-ref') &&
  !SUPABASE_ANON_KEY.includes('your-anon-key');

const authPortal = typeof document !== 'undefined' ? document.body?.dataset.authPortal || 'public' : 'public';
const supabaseClient = USE_SUPABASE ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storageKey: `montalban-auth-${SUPABASE_URL}-${authPortal}` }
}) : null;

function resortProfileMarkup(resort) {
  const facilities = Array.isArray(resort.facilities) ? resort.facilities : [];
  const today = new Date().toISOString().slice(0, 10);
  const closed = (Array.isArray(resort.closed_dates) ? resort.closed_dates : []).filter((day) => day >= today).sort();
  const hasPin = Number.isFinite(Number(resort.latitude)) && resort.latitude !== null && Number.isFinite(Number(resort.longitude)) && resort.longitude !== null;
  const rows = [
    facilities.length && `<p><strong>Facilities:</strong> ${facilities.map(escapeHtml).join(', ')}</p>`,
    resort.opening_hours && `<p><strong>Opening hours:</strong> ${escapeHtml(resort.opening_hours)}</p>`,
    resort.contact && `<p><strong>Phone:</strong> ${escapeHtml(resort.contact)}</p>`,
    /^https:\/\//i.test(resort.facebook_url || '') && `<p><a href="${escapeHtml(resort.facebook_url)}" target="_blank" rel="noopener noreferrer">Facebook page</a></p>`,
    resort.house_rules && `<p><strong>House rules and what to bring:</strong><br>${escapeHtml(resort.house_rules)}</p>`,
    hasPin && `<p><a href="https://www.google.com/maps?q=${Number(resort.latitude)},${Number(resort.longitude)}" target="_blank" rel="noopener noreferrer">View map pin</a></p>`,
    closed.length && `<p><strong>Closed on:</strong> ${closed.map(escapeHtml).join(', ')}</p>`
  ];
  return rows.filter(Boolean).join('');
}

async function resortPhotoMarkup(images, name) {
  const photos = Array.isArray(images) ? images : [];
  const markup = await Promise.all(photos.map(async (photo) => {
    try {
      if (typeof photo !== 'string' || !photo) throw new Error('Invalid resort photo.');
      let url = photo;
      if (!/^https?:\/\//i.test(photo)) {
        const { data, error } = await supabaseClient.storage.from('resort-photos').createSignedUrl(photo, 3600);
        if (error) throw error;
        if (!data?.signedUrl) throw new Error('No photo URL was returned.');
        url = data.signedUrl;
      }
      return `<img class="resort-photo" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" loading="lazy">`;
    } catch (error) {
      console.error('Unable to load resort photo.', error);
      return '<p class="error-message">Photo unavailable.</p>';
    }
  }));
  return markup.join('');
}

function renderResortPhotoContainers(container, listings) {
  container.querySelectorAll('[data-resort-photo-index]').forEach((element) => {
    const listing = listings[Number(element.dataset.resortPhotoIndex)];
    resortPhotoMarkup(listing.images, listing.name).then((markup) => { element.innerHTML = markup; });
  });
}

const ATTRACTION_PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const ATTRACTION_PHOTO_LIMIT = 5;

function renderAttractionPhotoList(container, images) {
  const photos = (Array.isArray(images) ? images : []).filter((url) => typeof url === 'string' && url);
  container.innerHTML = photos.map((url, index) => `
    <label class="attraction-photo-keep">
      <input type="checkbox" checked value="${escapeHtml(url)}" data-keep-attraction-photo>
      <img src="${escapeHtml(url)}" alt="Attraction photo ${index + 1}" width="64" height="64" loading="lazy">
      Keep photo ${index + 1}
    </label>`).join('');
}

// Returns the kept photo URLs plus public URLs of newly uploaded files; removes new uploads if any upload fails.
async function collectAttractionPhotos(listContainer, fileInput) {
  const kept = Array.from(listContainer.querySelectorAll('[data-keep-attraction-photo]:checked'), (item) => item.value);
  const files = Array.from(fileInput.files || []);
  if (!files.length) return kept;
  if (kept.length + files.length > ATTRACTION_PHOTO_LIMIT) {
    throw new Error(`Choose no more than ${ATTRACTION_PHOTO_LIMIT} photos in total.`);
  }
  if (files.some((file) => !ATTRACTION_PHOTO_TYPES[file.type] || !file.size || file.size > 5 * 1024 * 1024)) {
    throw new Error('Photos must be JPEG, PNG or WebP and no larger than 5 MB.');
  }
  if (!supabaseClient) throw new Error('Photo uploads need a Supabase connection.');
  const bucket = supabaseClient.storage.from('attraction-photos');
  const uploaded = [];
  try {
    for (const file of files) {
      const path = `${crypto.randomUUID()}.${ATTRACTION_PHOTO_TYPES[file.type]}`;
      const { error } = await bucket.upload(path, file);
      if (error) throw new Error(`Photo upload failed: ${error.message}`);
      uploaded.push(path);
    }
  } catch (error) {
    if (uploaded.length) await bucket.remove(uploaded).catch((cleanupError) => console.error('Unable to remove incomplete photo uploads.', cleanupError));
    throw error;
  }
  return [...kept, ...uploaded.map((path) => bucket.getPublicUrl(path).data.publicUrl)];
}

const SHOP_PRODUCT_PHOTO_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function uploadShopProductPhoto(file) {
  if (!file || !file.size) return null;
  if (!SHOP_PRODUCT_PHOTO_TYPES[file.type] || file.size > 5 * 1024 * 1024) {
    throw new Error('Product pictures must be JPEG, PNG or WebP and no larger than 5 MB.');
  }
  if (!supabaseClient) throw new Error('Product picture uploads need a Supabase connection.');
  const bucket = supabaseClient.storage.from('shop-product-photos');
  const path = `${crypto.randomUUID()}.${SHOP_PRODUCT_PHOTO_TYPES[file.type]}`;
  const { error } = await bucket.upload(path, file);
  if (error) throw new Error(`Product picture upload failed: ${error.message}`);
  const url = bucket.getPublicUrl(path).data?.publicUrl;
  if (!url) {
    try { await bucket.remove([path]); } catch (cleanupError) {
      console.error('Unable to remove a product picture without a public URL.', cleanupError);
    }
    throw new Error('No public URL was returned for the product picture.');
  }
  return { path, url };
}

async function removeShopProductPhoto(path) {
  if (!path) return;
  const { error } = await supabaseClient.storage.from('shop-product-photos').remove([path]);
  if (error) throw new Error(`Product picture cleanup failed: ${error.message}`);
}

// Roles come from Supabase Auth: 'admin' (app_metadata.role), 'authenticated' (guide) or 'anon'.
async function getAuthSession() {
  if (!supabaseClient) return null;
  const { data } = await supabaseClient.auth.getSession();
  return data?.session || null;
}

function getSessionRole(session) {
  if (!session) return 'anon';
  return ['admin', 'municipal_super_admin'].includes(session.user?.app_metadata?.role) ? 'admin' : 'authenticated';
}

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
  const existing = options.previousItems || await fetchOptionalSupabaseTable(tableName);
  const nextIds = new Set(items.map((item) => item.id));
  const removedIds = existing
    .map((item) => item.id)
    .filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    const { error } = await supabaseClient.from(tableName).delete().in('id', removedIds);
    if (error) return { error };
  }

  const previous = new Map(existing.map((item) => [item.id, item]));
  const changedItems = options.previousItems
    ? items.filter((item) => JSON.stringify(previous.get(item.id)) !== JSON.stringify(item))
    : items;
  if (!changedItems.length) return { error: null };
  const payload = withCreatedAt(changedItems);

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

async function loadStateFromSupabase() {
  const role = getSessionRole(await getAuthSession());
  // Row Level Security hides these tables from anon visitors, so only ask for what the role may read.
  const empty = Promise.resolve([]);
  const [attractions, bookings, guides, shopProducts, announcements, showcases, resorts, barangays] = await Promise.all([
    fetchSupabaseTable(STORE_NAMES.attractions),
    role === 'anon' ? empty : fetchOptionalSupabaseTable(STORE_NAMES.bookings),
    role === 'anon' ? empty : fetchOptionalSupabaseTable(STORE_NAMES.guides),
    fetchOptionalSupabaseTable(STORE_NAMES.shopProducts),
    fetchOptionalSupabaseTable(STORE_NAMES.announcements),
    fetchOptionalSupabaseTable(STORE_NAMES.showcases),
    fetchOptionalSupabaseTable(STORE_NAMES.resorts),
    fetchOptionalSupabaseTable(STORE_NAMES.barangays)
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
    shopProducts: shopProducts.length ? shopProducts : (cachedShopProducts.length ? cachedShopProducts : defaultState.shopProducts),
    announcements,
    showcases,
    resorts,
    barangays
  };
}

async function persistStateToSupabase(state) {
  if (!supabaseClient) {
    return state;
  }

  const role = getSessionRole(await getAuthSession());
  const previousState = appState || {};
  const changed = (collection) => JSON.stringify(previousState[collection] || []) !== JSON.stringify(state[collection] || []);

  if (role !== 'admin') {
    // Guides may only change the status of their own assigned bookings; RLS enforces the rest.
    if (role === 'authenticated' && changed('bookings')) {
      const before = new Map((previousState.bookings || []).map((item) => [item.id, item]));
      const updates = (state.bookings || []).filter((item) => before.get(item.id)?.status !== item.status);
      const results = await Promise.all(updates.map((item) => (
        supabaseClient.from(STORE_NAMES.bookings).update({ status: item.status }).eq('id', item.id)
      )));
      const failed = results.find((result) => result.error);
      window.lastSyncErrors = { bookings: failed?.error || null };
      if (failed) console.warn('Booking status save failed', failed.error);
    }
    return state;
  }

  writeLocalAttractions(state.attractions || []);
  writeLocalShopProducts(state.shopProducts || []);
  const [attractionsResult, bookingsResult, guidesResult, shopProductsResult] = await Promise.all([
    changed('attractions') ? persistSupabaseCollection(STORE_NAMES.attractions, state.attractions, {
      retryWithout: ['transportOptions']
    }) : { error: null },
    changed('bookings') ? persistSupabaseCollection(STORE_NAMES.bookings, state.bookings, {
      retryWithout: ['time', 'meetingPoint', 'scheduleNotes', 'contact', 'adults', 'kids', 'pwd', 'guideNote', 'created_at']
    }) : { error: null },
    changed('guides') ? persistSupabaseCollection(STORE_NAMES.guides, state.guides, {
      previousItems: previousState.guides || [],
      retryWithout: ['email', 'address', 'idNumber', 'experience', 'interviewDate', 'interviewTime', 'interviewLocation']
    }) : { error: null },
    changed('shopProducts') ? persistSupabaseCollection(STORE_NAMES.shopProducts, state.shopProducts || [], {
      previousItems: previousState.shopProducts || []
    }).catch((error) => ({
      error
    })) : { error: null }
  ]);

  if (attractionsResult.error || bookingsResult.error || guidesResult.error) {
    console.warn('Supabase save failed', attractionsResult.error || bookingsResult.error || guidesResult.error);
  }
  if (shopProductsResult.error) {
    console.warn('Optional shop product save failed. Run the shop_products migration to enable it.', shopProductsResult.error);
  }
  if (guidesResult.error) {
    console.warn('Guide save failed. Run the latest database migration and check Supabase permissions.', guidesResult.error);
  }
  // Let callers (e.g. the guide sign-up form) know whether the shared save actually reached Supabase.
  window.lastSyncErrors = {
    attractions: attractionsResult.error || null,
    bookings: bookingsResult.error || null,
    guides: guidesResult.error || null,
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
  shopProducts: [],
  announcements: [],
  showcases: [],
  resorts: [],
  barangays: []
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
    : ['approved', 'rejected', 'assigned', 'confirmed', 'ongoing'].includes(rawStatus)
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
    created_at: item.created_at || timestamp,
    updated_at: timestamp
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
      shopProducts: shopProducts.length ? shopProducts : defaultState.shopProducts,
      announcements: defaultState.announcements,
      showcases: defaultState.showcases,
      resorts: [],
      barangays: []
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
