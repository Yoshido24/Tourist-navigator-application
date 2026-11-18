(function () {
  const serviceTypes = [
    ['day_visit', 'Day visit or entrance'],
    ['facility', 'Cottage or facility'],
    ['overnight', 'Overnight stay'],
    ['activity', 'Activity or other service']
  ];
  const pricingUnits = ['person', 'group', 'day', 'night', 'hour', 'booking'];
  let owner = null;
  let approvedListing = null;
  let editableListing = null;

  function setMessage(id, text, isError = false) {
    const element = document.getElementById(id);
    element.textContent = text;
    element.classList.toggle('error-message', isError);
    element.hidden = false;
  }

  function showDashboardError(error) {
    const dashboard = document.getElementById('resort-dashboard');
    setMessage(dashboard && !dashboard.hidden ? 'owner-account-status' : 'owner-login-error', error.message, true);
  }

  function addServiceRow(containerId, service = {}) {
    const container = document.getElementById(containerId);
    const row = document.createElement('fieldset');
    row.className = 'resort-service-row';
    row.dataset.serviceRow = 'true';
    row.dataset.serviceId = service.id || '';
    row.innerHTML = `
      <label>Service category
        <select data-service-type aria-label="Service category">
          ${serviceTypes.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
        </select>
      </label>
      <label>Service name
        <input data-service-name maxlength="120" aria-label="Service name" />
      </label>
      <label>Fee in pesos
        <input data-service-fee type="number" min="0" step="1" aria-label="Fee in pesos" />
      </label>
      <label>Fee applies per
        <select data-service-unit aria-label="Fee unit">
          ${pricingUnits.map((unit) => `<option value="${unit}">${unit}</option>`).join('')}
        </select>
      </label>
      <button class="btn btn-secondary" type="button" data-remove-service>Remove service</button>
    `;
    row.querySelector('[data-service-type]').value = service.type || 'day_visit';
    row.querySelector('[data-service-name]').value = service.name || '';
    row.querySelector('[data-service-fee]').value = service.fee ?? '';
    row.querySelector('[data-service-unit]').value = service.pricingUnit || 'person';
    row.querySelector('[data-remove-service]').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function collectServices(containerId, includeIds) {
    const services = [];
    for (const row of document.querySelectorAll(`#${containerId} [data-service-row]`)) {
      const name = row.querySelector('[data-service-name]').value.trim();
      const rawFee = row.querySelector('[data-service-fee]').value;
      if (!name && !rawFee) continue;
      const fee = Number(rawFee);
      if (!name || !rawFee || !Number.isSafeInteger(fee) || fee < 0) {
        throw new Error('Each service needs a name and a valid non-negative whole-peso fee.');
      }
      services.push({
        ...(includeIds ? { id: row.dataset.serviceId || `service-${crypto.randomUUID()}` } : {}),
        type: row.querySelector('[data-service-type]').value,
        name,
        fee,
        pricingUnit: row.querySelector('[data-service-unit]').value
      });
    }
    if (!services.length) throw new Error('Add at least one service and fee.');
    return services;
  }

  function validResortCoords(coords) {
    if (typeof coords === 'string') {
      try {
        coords = JSON.parse(coords);
      } catch {
        return null;
      }
    }
    if (!Array.isArray(coords) || coords.length !== 2) return null;
    const [latitude, longitude] = coords.map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return [latitude, longitude];
  }

  function setupLocationPicker() {
    const form = document.getElementById('owner-listing-form');
    const chooseButton = document.getElementById('owner-choose-location');
    const modal = document.getElementById('owner-pin-modal');
    if (!form || !chooseButton || !modal) return null;
    const status = document.getElementById('owner-pin-status');
    const pickerStatus = document.getElementById('owner-pin-picker-status');
    const confirmButton = document.getElementById('owner-confirm-location');
    let map;
    let marker;
    let selectedCoords = null;
    let draftCoords = null;

    function showMarker(coords) {
      if (marker) map.removeLayer(marker);
      marker = window.L.marker(coords).addTo(map);
      marker.bindTooltip('Selected resort location');
    }

    function setStatus(coords) {
      const message = coords
        ? `Selected location: ${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`
        : 'Choose the resort location on the map.';
      status.textContent = message;
      pickerStatus.textContent = message;
      confirmButton.disabled = !coords;
    }

    chooseButton.addEventListener('click', () => {
      if (!window.L) {
        setMessage('owner-listing-error', 'The map could not load. Please try again.', true);
        return;
      }
      modal.hidden = false;
      draftCoords = selectedCoords;
      if (!map) {
        map = window.L.map('owner-pin-map', { zoomControl: true, scrollWheelZoom: true })
          .setView(selectedCoords || [14.73, 121.15], selectedCoords ? 15 : 13);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        map.on('click', (event) => {
          draftCoords = validResortCoords([event.latlng.lat, event.latlng.lng]);
          if (draftCoords) showMarker(draftCoords);
          setStatus(draftCoords);
        });
      } else {
        map.setView(selectedCoords || [14.73, 121.15], selectedCoords ? 15 : 13);
      }
      if (draftCoords) showMarker(draftCoords);
      setStatus(draftCoords);
      window.setTimeout(() => map.invalidateSize(), 0);
    });
    document.getElementById('owner-cancel-location').addEventListener('click', () => {
      modal.hidden = true;
      draftCoords = selectedCoords;
    });
    confirmButton.addEventListener('click', () => {
      if (!draftCoords) return;
      selectedCoords = draftCoords.slice();
      const message = `Resort pin: ${selectedCoords[0].toFixed(5)}, ${selectedCoords[1].toFixed(5)}`;
      status.textContent = message;
      pickerStatus.textContent = message;
      modal.hidden = true;
    });
    const setCoords = (coords) => {
      selectedCoords = validResortCoords(coords);
      const message = selectedCoords
        ? `Resort pin: ${selectedCoords[0].toFixed(5)}, ${selectedCoords[1].toFixed(5)}`
        : 'Choose the resort location on the map.';
      status.textContent = message;
      pickerStatus.textContent = message;
    };
    return { getCoords: () => selectedCoords, setCoords };
  }

  async function loadBarangays() {
    const { data, error } = await supabaseClient.from('barangays').select('id,name').order('name');
    if (error) throw error;
    if (!data.length) throw new Error('The barangay list is empty. Ask the Municipal Admin to add barangays.');
    ['signup-barangay', 'owner-listing-barangay'].forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;
      select.innerHTML = data.map((item) =>
        `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
      ).join('');
    });
    return data;
  }

  function renderListing(submissions, application) {
    const latestApproved = submissions.find((item) => item.status === 'Approved');
    const pending = submissions.find((item) => item.status === 'Pending');
    const rejected = submissions.find((item) => item.status === 'Rejected');
    approvedListing = latestApproved || null;
    editableListing = latestApproved || (!pending && rejected) || null;
    const display = document.getElementById('owner-listing');
    const editButton = document.getElementById('owner-edit-listing');
    if (latestApproved) {
      display.innerHTML = `
        <h3>${escapeHtml(latestApproved.name)}</h3>
        <p>${escapeHtml(latestApproved.description || '')}</p>
        <p><strong>Address:</strong> ${escapeHtml(latestApproved.address || 'Not provided')}</p>
        <p><strong>Status:</strong> ${pending ? 'An update is waiting for review; your current listing remains public.' : 'Approved and public'}</p>
        <p><strong>Services and fees:</strong></p>
        <ul>${(latestApproved.services || []).map((service) => `<li>${escapeHtml(service.name)} — ₱${Number(service.fee).toLocaleString('en-PH')} / ${escapeHtml(service.pricingUnit)}</li>`).join('')}</ul>`;
      editButton.hidden = Boolean(pending);
      editButton.textContent = 'Edit approved listing';
      return;
    }
    editButton.hidden = true;
    if (pending) {
      display.innerHTML = `<h3>${escapeHtml(pending.name)}</h3><p>Your first listing is waiting for Barangay Admin review.</p>`;
    } else if (rejected) {
      display.innerHTML = `<h3>${escapeHtml(rejected.name)}</h3><p>Your listing was rejected: ${escapeHtml(rejected.review_note || 'Contact the barangay tourism office for details.')}</p>`;
      editButton.hidden = false;
      editButton.textContent = 'Update and resubmit listing';
    } else if (application?.resort) {
      const resort = application.resort;
      editableListing = {
        name: resort.name,
        barangay_id: resort.barangayId,
        address: resort.address,
        description: resort.description,
        contact: resort.contact,
        images: resort.images,
        services: []
      };
      display.innerHTML = '<p>Add your services and fees, then submit your listing for barangay review.</p>';
      editButton.hidden = false;
      editButton.textContent = 'Set up listing';
    } else {
      display.innerHTML = '<p>Your owner account is approved, but no resort listing was found. Contact the Municipal Admin.</p>';
    }
  }

  function renderBookings(bookings) {
    const list = document.getElementById('owner-bookings');
    if (!bookings.length) {
      list.innerHTML = '<p class="empty-state">No resort booking requests yet.</p>';
      return;
    }
    list.innerHTML = bookings.map((booking) => `
      <article class="dashboard-card">
        <h3>${escapeHtml(booking.service_name || booking.attractionName || 'Resort request')}</h3>
        <p><strong>Guest:</strong> ${escapeHtml(booking.travelerName || 'Not provided')} (${Number(booking.adults || 0)} guests)</p>
        <p><strong>Dates:</strong> ${escapeHtml(booking.checkIn || booking.date || 'Not specified')} ${booking.checkOut ? `to ${escapeHtml(booking.checkOut)}` : ''}</p>
        <p><strong>Fee when requested:</strong> ₱${Number(booking.service_fee || 0).toLocaleString('en-PH')} / ${escapeHtml(booking.service_pricing_unit || 'booking')}</p>
        <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
        <p><strong>Notes:</strong> ${escapeHtml(booking.notes || 'None')}</p>
        <p><strong>Status:</strong> ${escapeHtml(booking.status || 'Pending')}</p>
        ${booking.status === 'Pending' ? `
          <div class="attraction-management-actions">
            <button class="btn btn-primary" type="button" data-owner-decision="Approved" data-booking-id="${escapeHtml(booking.id)}">Accept</button>
            <button class="btn btn-secondary" type="button" data-owner-decision="Rejected" data-booking-id="${escapeHtml(booking.id)}">Decline</button>
          </div>
          <p data-owner-booking-error="${escapeHtml(booking.id)}" class="success-message error-message" role="alert" hidden></p>` : ''}
      </article>
    `).join('');
    list.querySelectorAll('[data-owner-decision]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.bookingId;
        const { error } = await supabaseClient.from('bookings')
          .update({ status: button.dataset.ownerDecision })
          .eq('id', id);
        if (error) {
          const warning = list.querySelector(`[data-owner-booking-error="${CSS.escape(id)}"]`);
          warning.textContent = error.message;
          warning.hidden = false;
          return;
        }
        await loadOwnerDashboard();
      });
    });
  }

  async function loadOwnerDashboard() {
    const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) {
      owner = null;
      approvedListing = null;
      editableListing = null;
      document.getElementById('resort-auth-panel').hidden = false;
      document.getElementById('resort-dashboard').hidden = true;
      document.getElementById('resort-signout').hidden = true;
      window.setDashboardNavigation?.(false);
      document.getElementById('owner-listing-form').hidden = true;
      return;
    }
    document.getElementById('resort-auth-panel').hidden = true;
    document.getElementById('resort-dashboard').hidden = false;
    document.getElementById('resort-signout').hidden = false;
    window.setDashboardNavigation?.(true);
    const { data: manager, error: managerError } = await supabaseClient.from('resort_managers')
      .select('name').eq('auth_user_id', user.id).maybeSingle();
    if (managerError) throw managerError;
    if (!manager) {
      owner = null;
      approvedListing = null;
      editableListing = null;
      document.getElementById('owner-listing-form').hidden = true;
      const { data: application, error } = await supabaseClient.from('resort_manager_applications')
        .select('status,review_note').eq('auth_user_id', user.id).maybeSingle();
      if (error) throw error;
      document.getElementById('owner-dashboard-title').textContent = 'Owner application';
      setMessage('owner-account-status', application?.status === 'Rejected'
        ? `Your owner account was rejected. ${application.review_note || 'Contact the Municipal Admin for details.'}`
        : 'Your account is waiting for Municipal Admin approval.');
      document.getElementById('owner-listing').innerHTML = '';
      document.getElementById('owner-edit-listing').hidden = true;
      document.getElementById('owner-bookings').innerHTML = '';
      return;
    }
    owner = user;
    setMessage('owner-account-status', 'Your owner account is approved. New and changed listings are reviewed by the Barangay Admin.');
    const [barangays, submissionsResult, bookingsResult] = await Promise.all([
      loadBarangays(),
      supabaseClient.from('resort_submissions').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabaseClient.from('bookings').select('*').eq('target_type', 'resort').order('created_at', { ascending: false })
    ]);
    if (submissionsResult.error) throw submissionsResult.error;
    if (bookingsResult.error) throw bookingsResult.error;
    let application = null;
    if (!submissionsResult.data.length) {
      const result = await supabaseClient.from('resort_manager_applications')
        .select('resort').eq('auth_user_id', user.id).maybeSingle();
      if (result.error) throw result.error;
      application = result.data;
    }
    document.getElementById('owner-dashboard-title').textContent = manager.name;
    document.getElementById('owner-listing-barangay').innerHTML = barangays.map((item) =>
      `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
    ).join('');
    renderListing(submissionsResult.data, application);
    renderBookings(bookingsResult.data);
  }

  function setup() {
    const signIn = document.getElementById('resort-signin');
    const signUp = document.getElementById('resort-signup');
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      setMessage(signUp ? 'owner-signup-error' : 'owner-login-error', 'Connect this app to Supabase to continue.', true);
      return;
    }
    const listingLocation = setupLocationPicker();
    document.querySelectorAll('[data-add-service]').forEach((button) => {
      button.addEventListener('click', () => addServiceRow(button.dataset.addService));
    });

    signIn?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('owner-login-email').value.trim(),
        password: document.getElementById('owner-login-password').value
      });
      if (error) return setMessage('owner-login-error', error.message, true);
      try {
        await loadOwnerDashboard();
      } catch (error) {
        showDashboardError(error);
      }
    });
    signUp?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('owner-signup-error');
      const success = document.getElementById('owner-signup-message');
      errorBox.hidden = true;
      success.hidden = true;
      if (!document.getElementById('owner-terms').checked) return setMessage('owner-signup-error', 'Please accept the Terms of Use and Privacy Notice.', true);
      const { data, error } = await supabaseClient.functions.invoke('local-accounts', {
        body: {
          action: 'register-resort-manager',
          email: document.getElementById('owner-signup-email').value.trim(),
          password: document.getElementById('owner-signup-password').value,
          name: document.getElementById('owner-name').value.trim(),
          contact: document.getElementById('owner-contact').value.trim(),
          termsAccepted: true,
          resort: {
            name: document.getElementById('signup-resort-name').value.trim(),
            barangayId: document.getElementById('signup-barangay').value,
            address: document.getElementById('signup-resort-address').value.trim(),
            description: document.getElementById('signup-resort-description').value.trim()
          }
        }
      });
      if (error || !data?.ok) {
        const message = await getFunctionErrorMessage(data, error, 'Your application could not be submitted.');
        return setMessage('owner-signup-error', message, true);
      }
      document.getElementById('resort-signup').reset();
      setMessage('owner-signup-message', 'Application submitted. Sign in after registration; the Municipal Admin must approve your account before you can manage listings.');
    });
    document.getElementById('owner-edit-listing')?.addEventListener('click', () => {
      if (!editableListing) return;
      const form = document.getElementById('owner-listing-form');
      form.hidden = false;
      document.getElementById('owner-listing-name').value = editableListing.name;
      document.getElementById('owner-listing-barangay').value = editableListing.barangay_id;
      document.getElementById('owner-listing-address').value = editableListing.address || '';
      document.getElementById('owner-listing-description').value = editableListing.description || '';
      const rows = document.getElementById('owner-service-rows');
      rows.replaceChildren();
      (editableListing.services || []).forEach((service) => addServiceRow('owner-service-rows', service));
      if (!editableListing.services?.length) addServiceRow('owner-service-rows');
      listingLocation?.setCoords(editableListing.coords);
    });
    document.getElementById('owner-cancel-edit')?.addEventListener('click', () => {
      document.getElementById('owner-listing-form').hidden = true;
    });
    document.getElementById('owner-listing-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('owner-listing-error');
      errorBox.hidden = true;
      if (!editableListing || !owner) return setMessage('owner-listing-error', 'There is no listing to submit.', true);
      const coords = listingLocation?.getCoords();
      if (!coords) return setMessage('owner-listing-error', 'Choose the resort location on the map before submitting.', true);
      let services;
      try {
        services = collectServices('owner-service-rows', true);
      } catch (error) {
        return setMessage('owner-listing-error', error.message, true);
      }
      const { error } = await supabaseClient.from('resort_submissions').insert({
        resort_id: approvedListing?.resort_id || null,
        owner_id: owner.id,
        barangay_id: document.getElementById('owner-listing-barangay').value,
        name: document.getElementById('owner-listing-name').value.trim(),
        address: document.getElementById('owner-listing-address').value.trim(),
        description: document.getElementById('owner-listing-description').value.trim(),
        contact: editableListing.contact || '',
        images: editableListing.images || [],
        coords,
        services,
        status: 'Pending'
      });
      if (error) return setMessage('owner-listing-error', error.message, true);
      document.getElementById('owner-listing-form').hidden = true;
      try {
        await loadOwnerDashboard();
      } catch (error) {
        showDashboardError(error);
      }
    });
    document.getElementById('resort-signout')?.addEventListener('click', async () => {
      const { error } = await supabaseClient.auth.signOut();
      if (error) return setMessage('owner-account-status', error.message, true);
      await loadOwnerDashboard();
    });
    if (signUp) loadBarangays().catch((error) => setMessage('owner-signup-error', error.message, true));
    if (signIn) loadOwnerDashboard().catch(showDashboardError);
  }

  document.addEventListener('DOMContentLoaded', setup);
})();
