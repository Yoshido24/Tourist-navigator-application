(function () {
  const serviceTypes = [
    ['day_visit', 'Day visit or entrance'],
    ['facility', 'Cottage or facility'],
    ['overnight', 'Overnight stay'],
    ['activity', 'Activity or other service']
  ];
  const pricingUnits = ['person', 'group', 'day', 'night', 'hour', 'booking'];
  const declineReasons = ['Fully booked', 'Closed on those dates', 'Service unavailable', 'Other'];

  function estimatedTotal(booking) {
    const fee = Number(booking.service_fee || 0);
    if (booking.service_pricing_unit === 'person') return fee * (Number(booking.adults || 0) + Number(booking.kids || 0));
    return booking.service_pricing_unit === 'booking' ? fee : null;
  }
  let owner = null;
  let approvedListing = null;
  let editableListing = null;
  let listingSaving = false;
  let photoRenderVersion = 0;

  function clearListingPhotos() {
    photoRenderVersion += 1;
    const photos = document.getElementById('owner-listing-photos');
    if (photos) photos.innerHTML = '';
  }

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
    editableListing = pending || latestApproved || rejected || null;
    const display = document.getElementById('owner-listing');
    const editButton = document.getElementById('owner-edit-listing');
    const photos = document.getElementById('owner-listing-photos');
    const shownListing = latestApproved || pending || rejected;
    clearListingPhotos();
    if (photos) {
      const version = photoRenderVersion;
      if (shownListing?.images?.length) {
        resortPhotoMarkup(shownListing.images, shownListing.name).then((markup) => {
          if (version === photoRenderVersion) photos.innerHTML = markup;
        });
      }
    }
    if (latestApproved) {
      display.innerHTML = `
        <h3>${escapeHtml(latestApproved.name)}</h3>
        <p>${escapeHtml(latestApproved.description || '')}</p>
        <p><strong>Address:</strong> ${escapeHtml(latestApproved.address || 'Not provided')}</p>
        <p><strong>Status:</strong> ${pending ? 'An update is waiting for review; your current listing remains public.' : 'Approved and public'}</p>
        ${resortProfileMarkup(latestApproved)}
        <p><strong>Services and fees:</strong></p>
        <ul>${(latestApproved.services || []).map((service) => `<li>${escapeHtml(service.name)} — ₱${Number(service.fee).toLocaleString('en-PH')} / ${escapeHtml(service.pricingUnit)}</li>`).join('')}</ul>`;
      editButton.hidden = false;
      editButton.textContent = pending ? 'Edit pending changes' : 'Edit approved listing';
      return;
    }
    if (pending) {
      display.innerHTML = `<h3>${escapeHtml(pending.name)}</h3><p>Your first listing is waiting for Barangay Admin review.</p>`;
      editButton.hidden = false;
      editButton.textContent = 'Edit pending listing';
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
      editButton.hidden = true;
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
        <p><strong>Guest:</strong> ${escapeHtml(booking.travelerName || 'Not provided')} (${Number(booking.adults || 0) + Number(booking.kids || 0)} guests)</p>
        <p><strong>Dates:</strong> ${escapeHtml(booking.checkIn || booking.date || 'Not specified')} ${booking.checkOut ? `to ${escapeHtml(booking.checkOut)}` : ''}</p>
        <p><strong>Fee when requested:</strong> ₱${Number(booking.service_fee || 0).toLocaleString('en-PH')} / ${escapeHtml(booking.service_pricing_unit || 'booking')}</p>
        ${estimatedTotal(booking) === null ? '' : `<p><strong>Estimated total:</strong> ₱${estimatedTotal(booking).toLocaleString('en-PH')}</p>`}
        <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
        <p><strong>Notes:</strong> ${escapeHtml(booking.notes || 'None')}</p>
        <p><strong>Status:</strong> ${escapeHtml(booking.status || 'Pending')}</p>
        ${booking.status === 'Rejected' && booking.decline_reason ? `<p><strong>Decline reason:</strong> ${escapeHtml(booking.decline_reason)}</p>` : ''}
        ${booking.status === 'Pending' ? `
          <label>Reason if declining
            <select data-decline-reason="${escapeHtml(booking.id)}">
              <option value="">Choose a reason</option>
              ${declineReasons.map((reason) => `<option>${escapeHtml(reason)}</option>`).join('')}
            </select>
          </label>
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
        const warning = list.querySelector(`[data-owner-booking-error="${CSS.escape(id)}"]`);
        const declining = button.dataset.ownerDecision === 'Rejected';
        const reason = list.querySelector(`[data-decline-reason="${CSS.escape(id)}"]`)?.value || '';
        if (declining && !reason) {
          warning.textContent = 'Choose a reason before declining.';
          warning.hidden = false;
          return;
        }
        const { error } = await supabaseClient.from('bookings')
          .update(declining ? { status: 'Rejected', decline_reason: reason } : { status: 'Approved' })
          .eq('id', id);
        if (error) {
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
      clearListingPhotos();
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
      clearListingPhotos();
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
    window.BookingHistoryExport?.setup({ containerId: 'resort-booking-export' });
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
    const setText = (id, text) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    };
    setText('owner-account-name', manager.name);
    setText('owner-account-email', user.email || '');
    setText('owner-overview-listing', submissionsResult.data[0]?.status || (application ? 'Awaiting first submission' : 'No listing yet.'));
    const pendingCount = bookingsResult.data.filter((booking) => booking.status === 'Pending').length;
    setText('owner-overview-bookings', String(pendingCount));
    setText('resort-bookings-tab', pendingCount ? `Bookings (${pendingCount})` : 'Bookings');
    document.getElementById('owner-listing-barangay').innerHTML = barangays.map((item) =>
      `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`
    ).join('');
    renderListing(submissionsResult.data, application);
    await loadClosedDates();
    renderBookings(bookingsResult.data);
  }

  let closedDates = [];

  function renderClosedDates() {
    const list = document.getElementById('owner-closed-list');
    if (!list) return;
    list.innerHTML = closedDates.map((day) =>
      `<li>${escapeHtml(day)} <button class="btn btn-secondary" type="button" data-reopen-date="${escapeHtml(day)}">Reopen</button></li>`
    ).join('') || '<li>No closed dates.</li>';
    list.querySelectorAll('[data-reopen-date]').forEach((button) => {
      button.addEventListener('click', () => saveClosedDates(closedDates.filter((day) => day !== button.dataset.reopenDate)));
    });
  }

  async function saveClosedDates(next) {
    const { error } = await supabaseClient.rpc('set_resort_closed_dates', { target: approvedListing.resort_id, dates: next });
    if (error) return setMessage('owner-closed-error', error.message, true);
    document.getElementById('owner-closed-error').hidden = true;
    closedDates = next;
    renderClosedDates();
  }

  async function loadClosedDates() {
    const card = document.getElementById('owner-closed-card');
    if (!card) return;
    card.hidden = !approvedListing?.resort_id;
    if (card.hidden) return;
    const { data, error } = await supabaseClient.from('public_resorts')
      .select('closed_dates').eq('id', approvedListing.resort_id).maybeSingle();
    if (error) return setMessage('owner-closed-error', error.message, true);
    closedDates = Array.isArray(data?.closed_dates) ? [...data.closed_dates].sort() : [];
    renderClosedDates();
  }

  function setupMenu() {
    const toggle = document.getElementById('resort-menu-toggle');
    const dropdown = document.getElementById('resort-menu-dropdown');
    if (!toggle || !dropdown) return;
    const setOpen = (open) => {
      dropdown.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(dropdown.hidden));
    dropdown.addEventListener('click', () => setOpen(false));
    document.addEventListener('click', (event) => {
      if (!dropdown.hidden && !toggle.contains(event.target) && !dropdown.contains(event.target)) setOpen(false);
    });
  }

  function setup() {
    setupMenu();
    const signIn = document.getElementById('resort-signin');
    const signUp = document.getElementById('resort-signup');
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      setMessage(signUp ? 'owner-signup-error' : 'owner-login-error', 'Connect this app to Supabase to continue.', true);
      return;
    }
    document.querySelectorAll('[data-resort-tab]').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('[data-resort-tab]').forEach((item) => {
          item.classList.toggle('is-active', item === tab);
          item.setAttribute('aria-selected', String(item === tab));
          item.tabIndex = item === tab ? 0 : -1;
        });
        document.querySelectorAll('[data-resort-panel]').forEach((panel) => {
          panel.hidden = panel.id !== tab.dataset.resortTab;
        });
      });
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault();
        const tabs = Array.from(document.querySelectorAll('[data-resort-tab]')).filter((item) => item.parentElement === tab.parentElement);
        const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        next.click();
        next.focus();
      });
    });
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
      document.getElementById('owner-listing-images').value = '';
      const fieldValue = (id, value) => { const el = document.getElementById(id); if (el) el.value = value ?? ''; };
      fieldValue('owner-listing-contact', editableListing.contact);
      fieldValue('owner-listing-hours', editableListing.opening_hours);
      fieldValue('owner-listing-facebook', editableListing.facebook_url);
      fieldValue('owner-listing-rules', editableListing.house_rules);
      fieldValue('owner-listing-lat', editableListing.latitude);
      fieldValue('owner-listing-lng', editableListing.longitude);
      document.querySelectorAll('[data-facility]').forEach((box) => {
        box.checked = (editableListing.facilities || []).includes(box.value);
      });
      document.getElementById('owner-existing-photos').innerHTML = (editableListing.images || []).map((_, index) =>
        `<div><label><input type="radio" name="owner-cover-photo" data-cover-resort-photo value="${index}"${index === 0 ? ' checked' : ''}> Cover photo ${index + 1}</label>
        <label><input type="checkbox" data-remove-resort-photo value="${index}"> Remove photo ${index + 1}</label></div>`
      ).join('');
      const rows = document.getElementById('owner-service-rows');
      rows.replaceChildren();
      (editableListing.services || []).forEach((service) => addServiceRow('owner-service-rows', service));
      if (!editableListing.services?.length) addServiceRow('owner-service-rows');
    });
    document.getElementById('owner-add-closed')?.addEventListener('click', () => {
      const day = document.getElementById('owner-closed-date').value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setMessage('owner-closed-error', 'Choose a date to close.', true);
      if (closedDates.includes(day)) return;
      saveClosedDates([...closedDates, day].sort());
    });
    document.getElementById('owner-use-location')?.addEventListener('click', () => {
      if (!navigator.geolocation) return setMessage('owner-listing-error', 'Location is not available on this device. Enter the coordinates manually.', true);
      navigator.geolocation.getCurrentPosition((position) => {
        document.getElementById('owner-listing-lat').value = position.coords.latitude.toFixed(6);
        document.getElementById('owner-listing-lng').value = position.coords.longitude.toFixed(6);
      }, () => setMessage('owner-listing-error', 'Could not get your location. Enter the coordinates manually.', true));
    });
    document.getElementById('owner-cancel-edit')?.addEventListener('click', () => {
      document.getElementById('owner-listing-form').hidden = true;
    });
    document.getElementById('owner-listing-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (listingSaving) return;
      const errorBox = document.getElementById('owner-listing-error');
      errorBox.hidden = true;
      if (!editableListing || !owner) return setMessage('owner-listing-error', 'There is no listing to submit.', true);
      let services;
      try {
        services = collectServices('owner-service-rows', true);
      } catch (error) {
        return setMessage('owner-listing-error', error.message, true);
      }
      const removed = new Set(Array.from(document.querySelectorAll('[data-remove-resort-photo]:checked'), (item) => Number(item.value)));
      const coverIndex = Number(document.querySelectorAll('[data-cover-resort-photo]:checked')[0]?.value ?? 0);
      const images = (editableListing.images || []).filter((_, index) => !removed.has(index));
      const cover = (editableListing.images || [])[coverIndex];
      if (!removed.has(coverIndex) && cover && images.includes(cover)) images.unshift(...images.splice(images.indexOf(cover), 1));
      const fieldValue = (id) => document.getElementById(id)?.value?.trim() ?? '';
      const latitude = fieldValue('owner-listing-lat');
      const longitude = fieldValue('owner-listing-lng');
      if ((latitude === '') !== (longitude === '') || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude))) {
        return setMessage('owner-listing-error', 'Enter both latitude and longitude for the map pin, or leave both empty.', true);
      }
      const facebook = fieldValue('owner-listing-facebook');
      if (facebook && !/^https:\/\/\S+$/i.test(facebook)) {
        return setMessage('owner-listing-error', 'The Facebook link must start with https://.', true);
      }
      const files = Array.from(document.getElementById('owner-listing-images').files || []);
      if (files.length && images.length + files.length > 5) return setMessage('owner-listing-error', 'Choose no more than 5 photos in total.', true);
      if (files.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024 || !file.size)) {
        return setMessage('owner-listing-error', 'Photos must be JPEG, PNG or WebP and no larger than 5 MB.', true);
      }
      const submit = event.submitter;
      listingSaving = true;
      if (submit) submit.disabled = true;
      const uploaded = [];
      let submissionStarted = false;
      try {
        for (const file of files) {
          const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type];
          const path = `${owner.id}/${crypto.randomUUID()}.${extension}`;
          uploaded.push(path);
          const { error } = await supabaseClient.storage.from('resort-photos').upload(path, file);
          if (error) throw new Error(`Photo upload failed: ${error.message}`);
          images.push(path);
        }
        submissionStarted = true;
        const submission = {
          resort_id: approvedListing?.resort_id || null,
          owner_id: owner.id,
          barangay_id: document.getElementById('owner-listing-barangay').value,
          name: document.getElementById('owner-listing-name').value.trim(),
          address: document.getElementById('owner-listing-address').value.trim(),
          description: document.getElementById('owner-listing-description').value.trim(),
          contact: document.getElementById('owner-listing-contact') ? fieldValue('owner-listing-contact') : editableListing.contact || '',
          opening_hours: fieldValue('owner-listing-hours'),
          facebook_url: facebook,
          house_rules: fieldValue('owner-listing-rules'),
          facilities: Array.from(document.querySelectorAll('[data-facility]:checked'), (box) => box.value),
          latitude: latitude === '' ? null : Number(latitude),
          longitude: longitude === '' ? null : Number(longitude),
          images,
          services,
          status: 'Pending'
        };
        const result = editableListing.status === 'Pending'
          ? await supabaseClient.from('resort_submissions').update(submission)
            .eq('id', editableListing.id).eq('status', 'Pending').select('id').maybeSingle()
          : await supabaseClient.from('resort_submissions').insert(submission);
        if (result.error) throw result.error;
        if (editableListing.status === 'Pending' && !result.data) {
          throw new Error('Pending listing was not updated. Refresh and try again.');
        }
      } catch (error) {
        let message = error.message;
        if (!submissionStarted && uploaded.length) {
          try {
            const { error: cleanupError } = await supabaseClient.storage.from('resort-photos').remove(uploaded);
            if (cleanupError) throw cleanupError;
          } catch (cleanupError) {
            console.error('Unable to remove incomplete photo uploads.', cleanupError);
            message += ` Cleanup failed: ${cleanupError.message}`;
          }
        }
        return setMessage('owner-listing-error', message, true);
      } finally {
        listingSaving = false;
        if (submit) submit.disabled = false;
      }
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
