const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function normalizeBookingRequest(body, now, createId, captchaEnabled) {
  if (body?.action !== 'create-booking') {
    return { error: 'Unsupported booking request.' };
  }
  if (body.termsAccepted !== true) {
    return { error: 'Please accept the Terms of Use and Privacy Notice.' };
  }
  if (captchaEnabled && (typeof body.captchaToken !== 'string' || !body.captchaToken.trim())) {
    return { error: 'Please complete the human verification.' };
  }

  const input = body.booking;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Booking details are invalid.' };
  }
  const targetType = input.targetType ?? 'attraction';
  if (targetType !== 'attraction' && targetType !== 'resort') {
    return { error: 'Booking details are invalid.' };
  }

  const requiredText = [
    [targetType === 'resort' ? 'resortId' : 'attractionId', 100],
    ['travelerName', 120],
    ['contact', 30],
    ...(targetType === 'resort' ? [['serviceId', 120]] : [['date', 10]])
  ];
  for (const [field, maxLength] of requiredText) {
    if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > maxLength) {
      return { error: 'Please check the required booking details.' };
    }
  }

  const time = input.time ?? '';
  const notes = input.notes ?? '';
  if (typeof notes !== 'string' || notes.length > 1000) {
    return { error: 'Booking notes must be 1000 characters or fewer.' };
  }

  if (targetType === 'resort') {
    const hasStayDates = input.checkIn !== undefined || input.checkOut !== undefined;
    const date = hasStayDates ? null : parseIsoDate(input.date);
    const checkIn = hasStayDates ? parseIsoDate(input.checkIn) : null;
    const checkOut = hasStayDates ? parseIsoDate(input.checkOut) : null;
    if ((!hasStayDates && !date) || (hasStayDates && (!checkIn || !checkOut))) {
      return { error: 'Please choose a valid service date or stay dates.' };
    }
    if (checkIn && checkOut <= checkIn) return { error: 'Check-out must be after check-in.' };
    const guests = input.guests;
    if (!Number.isSafeInteger(guests) || guests < 1 || guests > 1000) {
      return { error: 'Please enter the number of guests.' };
    }
    return {
      captchaToken: captchaEnabled ? body.captchaToken.trim() : '',
      targetType,
      targetId: input.resortId.trim(),
      booking: {
        id: `booking-${createId()}`,
        target_type: 'resort',
        service_id: input.serviceId.trim(),
        travelerName: input.travelerName.trim(),
        contact: input.contact.trim(),
        adults: guests,
        kids: 0,
        pwd: 0,
        date: input.date ?? input.checkIn,
        ...(hasStayDates ? { checkIn: input.checkIn, checkOut: input.checkOut } : {}),
        notes: notes.trim(),
        status: 'Pending',
        terms_accepted_at: now().toISOString()
      }
    };
  }

  if (!parseIsoDate(input.date)) {
    return { error: 'Please choose a valid booking date.' };
  }

  const counts = {};
  for (const field of ['adults', 'kids', 'pwd']) {
    const count = input[field] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0 || count > 1000) {
      return { error: 'Please check the number of visitors.' };
    }
    counts[field] = count;
  }
  if (counts.adults + counts.kids + counts.pwd < 1) {
    return { error: 'A booking must include at least one visitor.' };
  }

  if (typeof time !== 'string' || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
    return { error: 'Please choose a valid start time.' };
  }

  return {
    captchaToken: captchaEnabled ? body.captchaToken.trim() : '',
    targetType,
    targetId: input.attractionId.trim(),
    booking: {
      id: `booking-${createId()}`,
      target_type: 'attraction',
      attractionId: input.attractionId.trim(),
      travelerName: input.travelerName.trim(),
      contact: input.contact.trim(),
      ...counts,
      date: input.date,
      time,
      notes: notes.trim(),
      status: 'Pending',
      terms_accepted_at: now().toISOString()
    }
  };
}


export function createSecureBookingHandler({
  env,
  fetchImpl = fetch,
  createId = () => crypto.randomUUID(),
  now = () => new Date()
}) {
  return async (request) => {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
    }

    let body;
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 16_384) {
        return jsonResponse({ ok: false, error: 'Booking request is too large.' }, 413);
      }
      body = JSON.parse(text);
    } catch {
      return jsonResponse({ ok: false, error: 'Booking request must contain valid JSON.' }, 400);
    }

    const captchaEnabled = env.RECAPTCHA_ENABLED !== 'false';
    const normalized = normalizeBookingRequest(body, now, createId, captchaEnabled);
    if (normalized.error) {
      return jsonResponse({ ok: false, error: normalized.error }, 400);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
    const recaptchaSecret = env.RECAPTCHA_SECRET_KEY;
    if (!supabaseUrl || !serviceRoleKey || (captchaEnabled && !recaptchaSecret)) {
      console.error('Booking function is missing required server secrets.');
      return jsonResponse({ ok: false, error: 'Booking service is not configured.' }, 500);
    }

    try {
      if (captchaEnabled) {
        const captchaBody = new URLSearchParams({
          secret: recaptchaSecret,
          response: normalized.captchaToken
        });
        const captchaResponse = await fetchImpl('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: captchaBody
        });
        if (!captchaResponse.ok) {
          console.error('CAPTCHA verification service returned HTTP', captchaResponse.status);
          return jsonResponse({ ok: false, error: 'Human verification is temporarily unavailable.' }, 502);
        }
        const captchaResult = await captchaResponse.json();
        if (captchaResult.success !== true) {
          console.error('CAPTCHA rejected:', JSON.stringify(captchaResult['error-codes'] || []));
          return jsonResponse({ ok: false, error: 'Human verification failed. Please try again.' }, 400);
        }
      }

      const headers = {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      };
      const isResort = normalized.targetType === 'resort';
      const destinationUrl = new URL(`${supabaseUrl}/rest/v1/${isResort ? 'resorts' : 'attractions'}`);
      destinationUrl.searchParams.set('id', `eq.${normalized.targetId}`);
      destinationUrl.searchParams.set('select', isResort ? 'id,name,owner_id,barangay_id,services' : 'id,name,barangay_id');
      destinationUrl.searchParams.set('limit', '1');
      const destinationResponse = await fetchImpl(destinationUrl, { headers });
      if (!destinationResponse.ok) {
        console.error('Booking destination lookup returned HTTP', destinationResponse.status);
        return jsonResponse({ ok: false, error: 'Unable to verify the selected destination.' }, 502);
      }
      const [destination] = await destinationResponse.json();
      if (!destination) {
        return jsonResponse({ ok: false, error: 'The selected destination is no longer available.' }, 400);
      }
      if (!isResort && !destination.barangay_id) {
        return jsonResponse({ ok: false, error: 'Bookings are paused until this attraction has an assigned barangay.' }, 400);
      }

      let service;
      if (isResort) {
        service = (Array.isArray(destination.services) ? destination.services : [])
          .find((item) => item?.id === normalized.booking.service_id);
        const validTypes = ['day_visit', 'facility', 'overnight', 'activity'];
        const validUnits = ['person', 'group', 'day', 'night', 'hour', 'booking'];
        if (!service || !validTypes.includes(service.type) ||
            typeof service.name !== 'string' || !service.name.trim() ||
            !Number.isSafeInteger(service.fee) || service.fee < 0 ||
            !validUnits.includes(service.pricingUnit)) {
          return jsonResponse({ ok: false, error: 'The selected resort service is no longer available.' }, 400);
        }
        const hasStayDates = normalized.booking.checkIn !== undefined;
        if ((service.type === 'overnight') !== hasStayDates) {
          return jsonResponse({ ok: false, error: 'Choose dates that match the selected service.' }, 400);
        }
      }

      const booking = {
        ...normalized.booking,
        attractionName: destination.name,
        target_id: destination.id,
        barangay_id: destination.barangay_id ?? null,
        ...(isResort ? {
          resort_id: destination.id,
          resort_owner_id: destination.owner_id,
          service_type: service.type,
          service_name: service.name.trim(),
          service_fee: service.fee,
          service_pricing_unit: service.pricingUnit
        } : {})
      };
      const bookingUrl = new URL(`${supabaseUrl}/rest/v1/bookings`);
      bookingUrl.searchParams.set('select', '*');
      const bookingResponse = await fetchImpl(bookingUrl, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify(booking)
      });
      if (!bookingResponse.ok) {
        console.error('Booking insert returned HTTP', bookingResponse.status);
        return jsonResponse({ ok: false, error: 'We could not save your booking. Please try again.' }, 502);
      }

      const [savedBooking] = await bookingResponse.json();
      return jsonResponse({ ok: true, booking: savedBooking }, 200);
    } catch (error) {
      console.error('Booking request failed.', error);
      return jsonResponse({ ok: false, error: 'Booking service is temporarily unavailable.' }, 502);
    }
  };
}
