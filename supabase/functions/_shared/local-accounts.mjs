const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SUPER_ADMIN_ROLES = ['admin', 'municipal_super_admin'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const jsonResponse = (body, status) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
});
const fail = (status, error) => ({ status, error });

const isText = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const isOptionalText = (value, max) => value === undefined || value === null || (typeof value === 'string' && value.length <= max);
function validateCredentials(body) {
  if (typeof body.email !== 'string' || body.email.length > 254 || !EMAIL_PATTERN.test(body.email.trim())) {
    return 'Please enter a valid email address.';
  }
  if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 72) {
    return 'Password must be between 8 and 72 characters.';
  }
  return null;
}

export function createLocalAccountsHandler({ env, fetchImpl = fetch, now = () => new Date() }) {
  const base = env.SUPABASE_URL;
  const serviceHeaders = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  const rest = (table, { method = 'GET', query = {}, body, prefer } = {}) => {
    const url = new URL(`${base}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return fetchImpl(url, {
      method,
      headers: prefer ? { ...serviceHeaders, Prefer: prefer } : serviceHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  };
  const inList = (ids) => `in.(${ids.map((id) => `"${id.replaceAll('"', '')}"`).join(',')})`;
  const deleteUser = (userId) => fetchImpl(`${base}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: serviceHeaders
  }).catch(() => null);

  async function barangaysExist(ids) {
    const response = await rest('barangays', { query: { select: 'id', id: inList(ids) } });
    if (!response.ok) throw new Error(`barangay lookup HTTP ${response.status}`);
    return (await response.json()).length === new Set(ids).size;
  }

  async function createBarangayAdmin(body, authorization) {
    const token = /^Bearer\s+(.+)$/i.exec(authorization || '')?.[1];
    if (!token) return fail(401, 'Please sign in as a Municipal Super Admin.');

    const callerResponse = await fetchImpl(`${base}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` }
    });
    if (!callerResponse.ok) return fail(401, 'Your session is not valid. Please sign in again.');
    const caller = await callerResponse.json();
    if (!SUPER_ADMIN_ROLES.includes(caller?.app_metadata?.role)) {
      return fail(403, 'Only a Municipal Super Admin can create Barangay Admin accounts.');
    }

    const credentialError = validateCredentials(body);
    const ids = body.barangayIds;
    if (credentialError) return fail(400, credentialError);
    if (!isOptionalText(body.name, 120)) return fail(400, 'Name must be 120 characters or fewer.');
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 50 || !ids.every((id) => isText(id, 100)) ||
        new Set(ids).size !== ids.length) {
      return fail(400, 'Choose at least one barangay, without duplicates.');
    }
    if (!(await barangaysExist(ids))) return fail(400, 'One or more barangays do not exist.');

    const coveredResponse = await rest('barangay_admin_assignments', {
      query: { select: 'barangay_id', barangay_id: inList(ids) }
    });
    if (!coveredResponse.ok) throw new Error(`assignment lookup HTTP ${coveredResponse.status}`);
    if ((await coveredResponse.json()).length) {
      return fail(409, 'A selected barangay already has a Barangay Admin.');
    }

    const userResponse = await fetchImpl(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        email: body.email.trim(),
        password: body.password,
        email_confirm: true,
        app_metadata: { role: 'barangay_admin' },
        user_metadata: { name: (body.name || '').trim() }
      })
    });
    if (!userResponse.ok) return fail(userResponse.status === 422 ? 409 : 502, 'That account could not be created. The email may already be in use.');
    const { id: userId } = await userResponse.json();

    const assignResponse = await rest('barangay_admin_assignments', {
      method: 'POST',
      prefer: 'return=minimal',
      body: ids.map((barangay_id) => ({ barangay_id, auth_user_id: userId }))
    });
    if (!assignResponse.ok) {
      await deleteUser(userId);
      return assignResponse.status === 409
        ? fail(409, 'A selected barangay already has a Barangay Admin.')
        : fail(502, 'The barangay assignment could not be saved.');
    }
    return { status: 200, body: { ok: true, userId } };
  }

  async function registerResortManager(body) {
    const credentialError = validateCredentials(body);
    const resort = body.resort;
    if (body.termsAccepted !== true) return fail(400, 'Please accept the Terms of Use and Privacy Notice.');
    if (credentialError) return fail(400, credentialError);
    if (!isText(body.name, 120) || !isOptionalText(body.contact, 30)) return fail(400, 'Please check your name and contact number.');
    if (!resort || typeof resort !== 'object' || Array.isArray(resort) ||
        !isText(resort.name, 120) || !isText(resort.barangayId, 100) ||
        !isOptionalText(resort.description, 2000) || !isOptionalText(resort.address, 240) ||
        !isOptionalText(resort.contact, 30)) {
      return fail(400, 'Please check the resort details.');
    }
    if (resort.services !== undefined && (!Array.isArray(resort.services) || resort.services.length)) {
      return fail(400, 'Add services in your dashboard after your account is approved.');
    }
    const images = Array.isArray(resort.images) ? resort.images : [];
    if (images.length > 10 || !images.every((image) => typeof image === 'string' && image.length <= 2048)) {
      return fail(400, 'Please check the resort images.');
    }
    if (!(await barangaysExist([resort.barangayId]))) return fail(400, 'Please choose a valid barangay.');

    // The municipal admin grants manager access only after reviewing this application.
    // The admin endpoint avoids public-signup settings and confirmation-email sending, which can fail independently of the email being taken.
    const signupResponse = await fetchImpl(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        email: body.email.trim(),
        password: body.password,
        email_confirm: true,
        user_metadata: { account_type: 'resort_manager', name: body.name.trim() }
      })
    });
    if (!signupResponse.ok) {
      let signupError = {};
      try {
        signupError = await signupResponse.json();
      } catch {
        // A non-JSON Auth response cannot be classified as a duplicate safely.
      }
      if (!signupError || typeof signupError !== 'object' || Array.isArray(signupError)) signupError = {};
      const errorCode = signupError.code || signupError.error_code;
      const errorMessage = signupError.message || signupError.msg || signupError.error_description || '';
      const duplicate = ['email_exists', 'user_already_exists'].includes(errorCode) ||
        /already registered|already exists/i.test(errorMessage);
      return duplicate
        ? fail(400, 'We could not create that account. The email may already be registered.')
        : fail(502, 'Account registration is temporarily unavailable.');
    }
    const user = await signupResponse.json();
    const userId = user?.id;
    if (!userId) return fail(502, 'Account registration is temporarily unavailable.');

    const applicationResponse = await rest('resort_manager_applications', {
      method: 'POST',
      prefer: 'return=minimal',
      body: {
        auth_user_id: userId,
        email: body.email.trim().toLowerCase(),
        name: body.name.trim(),
        contact: (body.contact || '').trim(),
        terms_accepted_at: now().toISOString(),
        resort: {
          barangayId: resort.barangayId,
          name: resort.name.trim(),
          description: (resort.description || '').trim(),
          address: (resort.address || '').trim(),
          contact: (resort.contact || body.contact || '').trim(),
          images,
          services: []
        },
        status: 'Pending'
      }
    });
    if (!applicationResponse.ok) {
      await deleteUser(userId);
      return fail(502, 'We could not save your registration. Please try again.');
    }
    return { status: 200, body: { ok: true } };
  }

  return async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
    if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);

    let body;
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > 65_536) {
        return jsonResponse({ ok: false, error: 'Request is too large.' }, 413);
      }
      body = JSON.parse(text);
    } catch {
      return jsonResponse({ ok: false, error: 'Request must contain valid JSON.' }, 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ ok: false, error: 'Request is invalid.' }, 400);
    }
    if (!base || !env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Local accounts function is missing required server secrets.');
      return jsonResponse({ ok: false, error: 'Account service is not configured.' }, 500);
    }

    try {
      let result;
      if (body.action === 'create-barangay-admin') {
        result = await createBarangayAdmin(body, request.headers.get('Authorization'));
      } else if (body.action === 'register-resort-manager') {
        result = await registerResortManager(body);
      } else {
        result = fail(400, 'Unsupported account request.');
      }
      return jsonResponse(result.error ? { ok: false, error: result.error } : result.body, result.status);
    } catch (error) {
      console.error('Local accounts request failed.', error);
      return jsonResponse({ ok: false, error: 'Account service is temporarily unavailable.' }, 502);
    }
  };
}
