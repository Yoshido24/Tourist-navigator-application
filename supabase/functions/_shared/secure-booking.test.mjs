import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const handlerPath = new URL('./secure-booking.mjs', import.meta.url);
const configPath = new URL('../../config.toml', import.meta.url);
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key',
  RECAPTCHA_SECRET_KEY: 'recaptcha-secret-test-key'
};
const bookingRequest = {
  action: 'create-booking',
  termsAccepted: true,
  captchaToken: 'valid-token',
  booking: {
    attractionId: 'river',
    attractionName: 'Untrusted name',
    travelerName: 'Juan Dela Cruz',
    contact: '09171234567',
    adults: 2,
    kids: 1,
    pwd: 0,
    date: '2026-12-01',
    time: '09:30',
    notes: 'Morning visit'
  }
};

async function createHandler(fetchImpl, handlerEnv = env) {
  assert.ok(existsSync(handlerPath), 'secure booking handler should exist');
  const { createSecureBookingHandler } = await import('./secure-booking.mjs');
  return createSecureBookingHandler({
    env: handlerEnv,
    fetchImpl,
    createId: () => 'test-id',
    now: () => new Date('2026-10-21T10:00:00.000Z')
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('allows unauthenticated browser calls only because the function verifies CAPTCHA', () => {
  const config = readFileSync(configPath, 'utf8');
  assert.match(config, /\[functions\.secure-api\]\s*verify_jwt\s*=\s*false/);
});

test('verifies CAPTCHA and inserts a normalized booking', async () => {
  const calls = [];
  const handler = await createHandler(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });

    if (url.hostname === 'www.google.com') {
      assert.equal(new URLSearchParams(init.body).get('secret'), env.RECAPTCHA_SECRET_KEY);
      assert.equal(new URLSearchParams(init.body).get('response'), 'valid-token');
      return jsonResponse({ success: true });
    }
    if (url.pathname.endsWith('/rest/v1/attractions')) {
      return jsonResponse([{ id: 'river', name: 'River Attraction', barangay_id: 'b1' }]);
    }
    if (url.pathname.endsWith('/rest/v1/bookings')) {
      return jsonResponse([{ id: 'booking-test-id' }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  });

  const response = await handler(new Request('https://app.example/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingRequest)
  }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  const inserted = JSON.parse(calls[2].init.body);
  assert.equal(inserted.id, 'booking-test-id');
  assert.equal(inserted.attractionName, 'River Attraction');
  assert.equal(inserted.status, 'Pending');
  assert.equal(inserted.terms_accepted_at, '2026-10-21T10:00:00.000Z');
  assert.equal('captchaToken' in inserted, false);
});

test('accepts a booking without CAPTCHA when server-side verification is disabled', async () => {
  const calls = [];
  const handler = await createHandler(async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.pathname.endsWith('/rest/v1/attractions')) {
      return jsonResponse([{ id: 'river', name: 'River Attraction', barangay_id: 'b1' }]);
    }
    if (url.pathname.endsWith('/rest/v1/bookings')) {
      return jsonResponse([{ id: 'booking-test-id' }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  }, {
    ...env,
    RECAPTCHA_ENABLED: 'false',
    RECAPTCHA_SECRET_KEY: undefined
  });

  const request = { ...bookingRequest };
  delete request.captchaToken;
  const response = await handler(new Request('https://app.example/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  }));
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls.some(({ url }) => url.hostname === 'www.google.com'), false);
});

test('rejects a booking without terms acceptance before network requests', async () => {
  let requestCount = 0;
  const handler = await createHandler(async () => {
    requestCount += 1;
    return jsonResponse({});
  });
  const response = await handler(new Request('https://app.example/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...bookingRequest, termsAccepted: false })
  }));

  assert.equal(response.status, 400);
  assert.equal(requestCount, 0);
});

test('rejects an invalid CAPTCHA without inserting a booking', async () => {
  let requestCount = 0;
  const handler = await createHandler(async (input) => {
    requestCount += 1;
    assert.equal(new URL(input).hostname, 'www.google.com');
    return jsonResponse({ success: false, 'error-codes': ['invalid-input-response'] });
  });
  const response = await handler(new Request('https://app.example/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingRequest)
  }));

  assert.equal(response.status, 400);
  assert.equal(requestCount, 1);
});

test('rejects impossible dates without contacting external services', async () => {
  let requestCount = 0;
  const handler = await createHandler(async () => {
    requestCount += 1;
    return jsonResponse({});
  });
  const response = await handler(new Request('https://app.example/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...bookingRequest,
      booking: { ...bookingRequest.booking, date: '2026-99-99' }
    })
  }));

  assert.equal(response.status, 400);
  assert.equal(requestCount, 0);
});

test('rejects an attraction that is not published', async () => {
  let requestCount = 0;
  const handler = await createHandler(async (input) => {
    requestCount += 1;
    if (new URL(input).hostname === 'www.google.com') return jsonResponse({ success: true });
    return jsonResponse([]);
  });
  const response = await handler(new Request('https://app.example/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bookingRequest)
  }));

  assert.equal(response.status, 400);
  assert.equal(requestCount, 2);
});

test('answers CORS preflight without contacting external services', async () => {
  let requestCount = 0;
  const handler = await createHandler(async () => {
    requestCount += 1;
    return jsonResponse({});
  });
  const response = await handler(new Request('https://app.example/book', {
    method: 'OPTIONS'
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(requestCount, 0);
});

const resortRequest = {
  action: 'create-booking',
  termsAccepted: true,
  captchaToken: 'valid-token',
  booking: {
    targetType: 'resort',
    resortId: 'resort-1',
    serviceId: 'room-1',
    resortName: 'Untrusted resort',
    resortOwnerId: 'attacker',
    barangayId: 'attacker-barangay',
    travelerName: 'Juan Dela Cruz',
    contact: '09171234567',
    guests: 3,
    checkIn: '2026-12-01',
    checkOut: '2026-12-03',
    notes: 'Late arrival'
  }
};

function post(body) {
  return new Request('https://app.example/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function bookingBackend({
  attraction = { id: 'river', name: 'River Attraction', barangay_id: 'b1' },
  resort = {
    id: 'resort-1',
    name: 'Sunset Resort',
    owner_id: 'owner-1',
    barangay_id: 'b2',
    services: [
      { id: 'day-1', type: 'day_visit', name: 'Day visit', fee: 250, pricingUnit: 'person' },
      { id: 'cottage-1', type: 'facility', name: 'Cottage', fee: 1200, pricingUnit: 'day' },
      { id: 'room-1', type: 'overnight', name: 'Garden room', fee: 3500, pricingUnit: 'night' },
      { id: 'kayak-1', type: 'activity', name: 'Kayak rental', fee: 400, pricingUnit: 'hour' }
    ]
  }
} = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.hostname === 'www.google.com') return jsonResponse({ success: true });
    if (url.pathname.endsWith('/rest/v1/attractions')) return jsonResponse(attraction ? [attraction] : []);
    if (url.pathname.endsWith('/rest/v1/resorts')) return jsonResponse(resort ? [resort] : []);
    if (url.pathname.endsWith('/rest/v1/bookings')) return jsonResponse([JSON.parse(init.body)]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const inserts = () => calls.filter(({ url, init }) => url.pathname.endsWith('/rest/v1/bookings') && init.method === 'POST');
  return { calls, fetchImpl, inserts };
}

test('routes an attraction booking to the barangay of the stored attraction', async () => {
  const backend = bookingBackend();
  const handler = await createHandler(backend.fetchImpl);
  const response = await handler(post(bookingRequest));
  assert.equal(response.status, 200);
  const inserted = JSON.parse(backend.inserts()[0].init.body);
  assert.equal(inserted.target_type, 'attraction');
  assert.equal(inserted.target_id, 'river');
  assert.equal(inserted.barangay_id, 'b1');
  assert.equal(inserted.attractionId, 'river');
});

test('does not create bookings for attractions without a barangay', async () => {
  const backend = bookingBackend({ attraction: { id: 'river', name: 'River Attraction', barangay_id: null } });
  const handler = await createHandler(backend.fetchImpl);
  const response = await handler(post(bookingRequest));
  assert.equal(response.status, 400);
  assert.equal(backend.inserts().length, 0);
  assert.match((await response.json()).error, /barangay/i);
});

test('routes a resort stay request to the stored owner and ignores client routing fields', async () => {
  const backend = bookingBackend();
  const handler = await createHandler(backend.fetchImpl);
  const response = await handler(post(resortRequest));
  assert.equal(response.status, 200);
  const inserted = JSON.parse(backend.inserts()[0].init.body);
  assert.equal(inserted.target_type, 'resort');
  assert.equal(inserted.target_id, 'resort-1');
  assert.equal(inserted.resort_id, 'resort-1');
  assert.equal(inserted.resort_owner_id, 'owner-1');
  assert.equal(inserted.barangay_id, 'b2');
  assert.equal(inserted.attractionName, 'Sunset Resort');
  assert.equal(inserted.checkIn, '2026-12-01');
  assert.equal(inserted.checkOut, '2026-12-03');
  assert.equal(inserted.date, '2026-12-01');
  assert.equal(inserted.adults, 3);
  assert.equal(inserted.service_id, 'room-1');
  assert.equal(inserted.service_type, 'overnight');
  assert.equal(inserted.service_name, 'Garden room');
  assert.equal(inserted.service_fee, 3500);
  assert.equal(inserted.service_pricing_unit, 'night');
  assert.equal(inserted.status, 'Pending');
  assert.equal(inserted.attractionId, undefined);
});

test('resort requests accept all published service types and use the stored fee', async () => {
  const requested = [
    { serviceId: 'day-1', date: '2026-12-01', type: 'day_visit', name: 'Day visit', fee: 250 },
    { serviceId: 'cottage-1', date: '2026-12-01', type: 'facility', name: 'Cottage', fee: 1200 },
    { serviceId: 'room-1', checkIn: '2026-12-01', checkOut: '2026-12-03', type: 'overnight', name: 'Garden room', fee: 3500 },
    { serviceId: 'kayak-1', date: '2026-12-01', type: 'activity', name: 'Kayak rental', fee: 400 }
  ];
  for (const expected of requested) {
    const backend = bookingBackend();
    const handler = await createHandler(backend.fetchImpl);
    const { type, name, fee, ...requestFields } = expected;
    const booking = { ...resortRequest.booking };
    delete booking.checkIn;
    delete booking.checkOut;
    const response = await handler(post({
      ...resortRequest,
      booking: { ...booking, ...requestFields, fee: 1, serviceName: 'Forged service' }
    }));
    assert.equal(response.status, 200);
    const inserted = JSON.parse(backend.inserts()[0].init.body);
    assert.equal(inserted.service_type, type);
    assert.equal(inserted.service_name, name);
    assert.equal(inserted.service_fee, fee);
  }
});

test('rejects unknown resort services without creating a booking', async () => {
  const backend = bookingBackend();
  const handler = await createHandler(backend.fetchImpl);
  const response = await handler(post({
    ...resortRequest,
    booking: { ...resortRequest.booking, serviceId: 'not-published' }
  }));
  assert.equal(response.status, 400);
  assert.equal(backend.inserts().length, 0);
});

test('rejects a resort that is unknown or not approved without inserting', async () => {
  const backend = bookingBackend({ resort: null });
  const handler = await createHandler(backend.fetchImpl);
  const response = await handler(post(resortRequest));
  assert.equal(response.status, 400);
  assert.equal(backend.inserts().length, 0);
});

test('rejects an unsupported target type without any request', async () => {
  const backend = bookingBackend();
  const handler = await createHandler(backend.fetchImpl);
  const response = await handler(post({ ...resortRequest, booking: { ...resortRequest.booking, targetType: 'hotel' } }));
  assert.equal(response.status, 400);
  assert.equal(backend.calls.length, 0);
});

test('rejects bad stay dates and guest counts before any external request', async () => {
  const bad = [
    { checkIn: '2026-12-03', checkOut: '2026-12-03' },
    { checkIn: '2026-12-03', checkOut: '2026-12-01' },
    { checkIn: '2026-13-01' },
    { checkOut: 'soon' },
    { checkIn: undefined },
    { guests: 0 },
    { guests: 1.5 },
    { guests: 5000 }
  ];
  for (const override of bad) {
    const backend = bookingBackend();
    const handler = await createHandler(backend.fetchImpl);
    const response = await handler(post({ ...resortRequest, booking: { ...resortRequest.booking, ...override } }));
    assert.equal(response.status, 400, JSON.stringify(override));
    assert.equal(backend.calls.length, 0, JSON.stringify(override));
  }
});
