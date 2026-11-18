import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const handlerPath = new URL('./local-accounts.mjs', import.meta.url);
const configPath = new URL('../../config.toml', import.meta.url);
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-test-key'
};

const provisionBody = {
  action: 'create-barangay-admin',
  email: 'captain@example.com',
  password: 'a-strong-password',
  name: 'Barangay Captain',
  barangayIds: ['b1', 'b2']
};
const registerBody = {
  action: 'register-resort-manager',
  email: 'owner@example.com',
  password: 'a-strong-password',
  name: 'Resort Owner',
  contact: '09171234567',
  termsAccepted: true,
  resort: {
    name: 'Sunset Resort',
    barangayId: 'b1',
    description: 'Pool and cottages',
    address: 'Purok 1',
    services: []
  }
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function request(body, token = 'caller-token') {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://example.supabase.co/functions/v1/local-accounts', {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
}

// A tiny in-memory Supabase: records every call so tests can assert what was (not) written.
function createBackend({ callerRole = 'municipal_super_admin', assigned = [], barangays = ['b1', 'b2'], failSubmission = false } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: url.pathname, search: url.search, body });

    if (url.pathname === '/auth/v1/user') {
      return callerRole === null
        ? jsonResponse({ msg: 'invalid' }, 401)
        : jsonResponse({ id: 'caller-id', app_metadata: { role: callerRole } });
    }
    if (url.pathname.endsWith('/rest/v1/barangays')) {
      const requested = [...url.searchParams.get('id').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      return jsonResponse(barangays.filter((id) => requested.includes(id)).map((id) => ({ id })));
    }
    if (url.pathname.endsWith('/rest/v1/barangay_admin_assignments') && method === 'GET') {
      const requested = [...url.searchParams.get('barangay_id').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      return jsonResponse(assigned.filter((id) => requested.includes(id)).map((barangay_id) => ({ barangay_id })));
    }
    if (url.pathname === '/auth/v1/admin/users' && method === 'POST') {
      return jsonResponse({ id: 'new-admin-id' });
    }
    if (url.pathname === '/auth/v1/signup') {
      return jsonResponse({ id: 'new-manager-id', identities: [{ id: 'identity-id' }] });
    }
    if (url.pathname.startsWith('/auth/v1/admin/users/') && method === 'DELETE') {
      return jsonResponse({});
    }
    if (url.pathname.endsWith('/rest/v1/resort_manager_applications') && failSubmission) {
      return jsonResponse({ message: 'boom' }, 500);
    }
    if (method === 'POST' && url.pathname.includes('/rest/v1/')) {
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  const find = (method, path) => calls.filter((c) => c.method === method && c.path.endsWith(path));
  return { calls, fetchImpl, find };
}

async function createHandler(fetchImpl) {
  assert.ok(existsSync(handlerPath), 'local accounts handler should exist');
  const { createLocalAccountsHandler } = await import('./local-accounts.mjs');
  return createLocalAccountsHandler({ env, fetchImpl, now: () => new Date('2026-11-17T08:00:00.000Z') });
}

test('allows public registration while the handler checks staff authorization', () => {
  const config = readFileSync(configPath, 'utf8');
  assert.match(config, /\[functions\.local-accounts\]\s*verify_jwt\s*=\s*false/);
});

test('does not alter or delete an existing account returned by signup', async () => {
  const backend = createBackend();
  const fetchImpl = async (input, init = {}) => {
    if (new URL(input).pathname === '/auth/v1/signup') {
      return jsonResponse({ id: 'existing-id', identities: [] });
    }
    return backend.fetchImpl(input, init);
  };
  const response = await (await createHandler(fetchImpl))(request(registerBody, null));
  assert.equal(response.status, 400);
  assert.equal(backend.find('POST', '/rest/v1/resort_managers').length, 0);
  assert.equal(backend.find('POST', '/rest/v1/resort_manager_applications').length, 0);
  assert.equal(backend.find('DELETE', '/auth/v1/admin/users/existing-id').length, 0);
});

test('rejects staff provisioning from callers that are not Municipal Super Admins', async () => {
  for (const callerRole of ['barangay_admin', 'resort_manager', 'tourist']) {
    const backend = createBackend({ callerRole });
    const response = await (await createHandler(backend.fetchImpl))(request(provisionBody));
    assert.equal(response.status, 403);
    assert.equal(backend.find('POST', '/auth/v1/admin/users').length, 0);
  }
});

test('rejects staff provisioning without a valid session', async () => {
  const backend = createBackend({ callerRole: null });
  const response = await (await createHandler(backend.fetchImpl))(request(provisionBody));
  assert.equal(response.status, 401);
  assert.equal(backend.find('POST', '/auth/v1/admin/users').length, 0);
});

test('rejects a second Barangay Admin for an already-covered barangay and creates nothing', async () => {
  const backend = createBackend({ assigned: ['b2'] });
  const response = await (await createHandler(backend.fetchImpl))(request(provisionBody));
  assert.equal(response.status, 409);
  assert.equal(backend.find('POST', '/auth/v1/admin/users').length, 0);
  assert.equal(backend.find('POST', '/rest/v1/barangay_admin_assignments').length, 0);
});

test('creates a Barangay Admin with trusted role metadata and one assignment per barangay', async () => {
  const backend = createBackend({ callerRole: 'admin' });
  const response = await (await createHandler(backend.fetchImpl))(request(provisionBody));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, userId: 'new-admin-id' });

  const [created] = backend.find('POST', '/auth/v1/admin/users');
  assert.equal(created.body.email, 'captain@example.com');
  assert.equal(created.body.app_metadata.role, 'barangay_admin');
  assert.equal(created.body.email_confirm, true);
  const [assignments] = backend.find('POST', '/rest/v1/barangay_admin_assignments');
  assert.deepEqual(assignments.body, [
    { barangay_id: 'b1', auth_user_id: 'new-admin-id' },
    { barangay_id: 'b2', auth_user_id: 'new-admin-id' }
  ]);
  assert.ok(!JSON.stringify(payload).includes('password'));
});

test('removes the new account when the assignment cannot be saved', async () => {
  const backend = createBackend();
  const inner = backend.fetchImpl;
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/rest/v1/barangay_admin_assignments') && init.method === 'POST') {
      backend.calls.push({ method: 'POST', path: url.pathname, body: JSON.parse(init.body) });
      return jsonResponse({ code: '23505' }, 409);
    }
    return inner(input, init);
  };
  const response = await (await createHandler(fetchImpl))(request(provisionBody));
  assert.equal(response.status, 409);
  assert.equal(backend.find('DELETE', '/auth/v1/admin/users/new-admin-id').length, 1);
});

test('rejects invalid staff input before any write', async () => {
  const bad = [
    { ...provisionBody, email: 'not-an-email' },
    { ...provisionBody, password: 'short' },
    { ...provisionBody, barangayIds: [] },
    { ...provisionBody, barangayIds: ['b1', 'b1'] },
    { ...provisionBody, barangayIds: ['missing'] }
  ];
  for (const body of bad) {
    const backend = createBackend();
    const response = await (await createHandler(backend.fetchImpl))(request(body));
    assert.equal(response.status, 400);
    assert.equal(backend.find('POST', '/auth/v1/admin/users').length, 0);
  }
});

test('self-registration creates a pending owner application but grants no access before approval', async () => {
  const backend = createBackend();
  const hostile = {
    ...registerBody,
    role: 'municipal_super_admin',
    app_metadata: { role: 'admin' },
    ownerId: 'someone-else',
    resort: { ...registerBody.resort, owner_id: 'someone-else', status: 'Approved' }
  };
  const response = await (await createHandler(backend.fetchImpl))(request(hostile, null));
  assert.equal(response.status, 200);

  const [signup] = backend.find('POST', '/auth/v1/signup');
  assert.equal(signup.body.data.account_type, 'resort_manager');
  assert.ok(!JSON.stringify(signup.body).includes('municipal_super_admin'));
  assert.ok(!('app_metadata' in signup.body));

  const [application] = backend.find('POST', '/rest/v1/resort_manager_applications');
  assert.equal(application.body.auth_user_id, 'new-manager-id');
  assert.equal(application.body.email, 'owner@example.com');
  assert.equal(application.body.status, 'Pending');
  assert.equal(application.body.resort.barangayId, 'b1');
  assert.deepEqual(application.body.resort.services, []);
  assert.equal(backend.find('POST', '/rest/v1/resort_managers').length, 0);
  assert.equal(backend.find('POST', '/rest/v1/resort_submissions').length, 0);
  assert.equal(backend.find('POST', '/rest/v1/resorts').length, 0);
  assert.equal(backend.find('POST', '/rest/v1/barangay_admin_assignments').length, 0);
});

test('allows owner registration without services and stores an empty service list', async () => {
  const backend = createBackend();
  const { services, ...resort } = registerBody.resort;
  const response = await (await createHandler(backend.fetchImpl))(request({ ...registerBody, resort }, null));
  assert.equal(response.status, 200);
  const [application] = backend.find('POST', '/rest/v1/resort_manager_applications');
  assert.deepEqual(application.body.resort.services, []);
});

test('requires services to be added after account approval', async () => {
  const backend = createBackend();
  const body = { ...registerBody, resort: { ...registerBody.resort, services: [
    { type: 'day_visit', name: 'Entry', fee: 250, pricingUnit: 'person' }
  ] } };
  const response = await (await createHandler(backend.fetchImpl))(request(body, null));
  assert.equal(response.status, 400);
  assert.equal(backend.find('POST', '/auth/v1/signup').length, 0);
});

test('rejects invalid resort-manager registration without creating records', async () => {
  const bad = [
    { ...registerBody, termsAccepted: false },
    { ...registerBody, email: 'nope' },
    { ...registerBody, password: '123' },
    { ...registerBody, name: '' },
    { ...registerBody, resort: { ...registerBody.resort, name: '' } },
    { ...registerBody, resort: { ...registerBody.resort, barangayId: 'missing' } },
    { ...registerBody, resort: { ...registerBody.resort, services: [{ type: 'payment', name: 'Fake', fee: -1 }] } },
    { ...registerBody, resort: { ...registerBody.resort, services: [{ type: 'activity', name: 'Kayak', fee: 'free' }] } }
  ];
  for (const body of bad) {
    const backend = createBackend();
    const response = await (await createHandler(backend.fetchImpl))(request(body, null));
    assert.equal(response.status, 400);
    assert.equal(backend.find('POST', '/auth/v1/signup').length, 0);
    assert.equal(backend.find('POST', '/rest/v1/resort_managers').length, 0);
  }
});

test('removes the new manager account when the application cannot be saved', async () => {
  const backend = createBackend({ failSubmission: true });
  const response = await (await createHandler(backend.fetchImpl))(request(registerBody, null));
  assert.equal(response.status, 502);
  assert.equal(backend.find('DELETE', '/auth/v1/admin/users/new-manager-id').length, 1);
});
