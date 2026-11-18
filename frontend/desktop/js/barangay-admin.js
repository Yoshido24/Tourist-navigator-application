(function () {
  const signInPanel = document.getElementById('barangay-signin-panel');
  const dashboard = document.getElementById('barangay-dashboard');
  const signInForm = document.getElementById('barangay-signin');
  const signInMessage = document.getElementById('barangay-signin-message');
  const accessMessage = document.getElementById('barangay-access-message');
  const signOutButton = document.getElementById('barangay-signout');

  function showError(element, error) {
    element.textContent = error?.message || String(error);
    element.hidden = false;
  }

  function serviceSummary(services) {
    return (Array.isArray(services) ? services : []).map((service) =>
      `${escapeHtml(service.name)} — ₱${Number(service.fee).toLocaleString('en-PH')} / ${escapeHtml(service.pricingUnit)}`
    ).join('<br>');
  }

  async function loadDashboard() {
    const session = await getAuthSession();
    const user = session?.user;
    if (!user || user.app_metadata?.role !== 'barangay_admin') {
      dashboard.hidden = true;
      signInPanel.hidden = false;
      signOutButton.hidden = true;
      window.setDashboardNavigation?.(false);
      if (user) showError(signInMessage, new Error('This account is not a Barangay Admin. Ask the Municipal Admin to assign your account.'));
      return;
    }

    signInPanel.hidden = true;
    dashboard.hidden = false;
    window.setDashboardNavigation?.(true);
    signOutButton.hidden = false;
    accessMessage.hidden = true;
    const assignmentsResult = await supabaseClient
      .from('barangay_admin_assignments')
      .select('barangay_id')
      .eq('auth_user_id', user.id);
    if (assignmentsResult.error) throw assignmentsResult.error;
    const ids = assignmentsResult.data.map((assignment) => assignment.barangay_id);
    if (!ids.length) {
      document.getElementById('barangay-title').textContent = 'No barangay assigned';
      showError(accessMessage, new Error('Ask the Municipal Admin to assign your barangay before using this portal.'));
      document.getElementById('barangay-bookings').innerHTML = '';
      document.getElementById('barangay-resort-submissions').innerHTML = '';
      return;
    }

    const [barangaysResult, bookingsResult, attractionsResult, guidesResult, submissionsResult, attractionProposals, shopProposals] = await Promise.all([
      supabaseClient.from('barangays').select('id,name').in('id', ids),
      supabaseClient.from('bookings').select('*').eq('target_type', 'attraction').order('created_at', { ascending: false }),
      supabaseClient.from('attractions').select('*').in('barangay_id', ids),
      supabaseClient.from('guides').select('id,name,specialty,barangay_id').eq('status', 'Approved'),
      supabaseClient.from('resort_submissions').select('*').eq('status', 'Pending').order('created_at', { ascending: false }),
      supabaseClient.from('attraction_submissions').select('*').order('created_at', { ascending: false }),
      supabaseClient.from('shop_submissions').select('*').order('created_at', { ascending: false })
    ]);
    for (const result of [barangaysResult, bookingsResult, attractionsResult, guidesResult, submissionsResult, attractionProposals, shopProposals]) {
      if (result.error) throw result.error;
    }

    const barangays = new Map(barangaysResult.data.map((item) => [item.id, item.name]));
    const attractions = new Map(attractionsResult.data.map((item) => [item.id, item.name]));
    document.getElementById('barangay-title').textContent = barangaysResult.data.map((item) => item.name).join(', ');
    renderBookings(bookingsResult.data, attractions, guidesResult.data);
    renderSubmissions(submissionsResult.data, barangays);
    renderLocalContent(barangaysResult.data, attractionsResult.data, attractionProposals.data, shopProposals.data);
  }

  function renderLocalContent(barangays, attractions, attractionProposals, shopProposals) {
    const options = barangays.map((area) => `<option value="${escapeHtml(area.id)}">${escapeHtml(area.name)}</option>`).join('');
    ['attraction-area', 'shop-area'].forEach((id) => {
      const select = document.getElementById(id);
      const selected = select.value;
      select.innerHTML = options;
      if (barangays.some((area) => area.id === selected)) select.value = selected;
    });
    const list = document.getElementById('local-attractions');
    list.innerHTML = attractions.length ? attractions.map((item) => `
      <article class="dashboard-card"><h4>${escapeHtml(item.name)}</h4>
      <p>${escapeHtml(item.category || '')}</p>
      <button class="btn btn-secondary" type="button" data-edit-attraction="${escapeHtml(item.id)}">Edit</button></article>`).join('')
      : '<p class="empty-state">No attractions in your assigned barangays.</p>';
    list.querySelectorAll('[data-edit-attraction]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = attractions.find((attraction) => attraction.id === button.dataset.editAttraction);
        document.getElementById('local-attraction-id').value = item.id;
        document.getElementById('attraction-area').value = item.barangay_id;
        document.getElementById('attraction-area').disabled = true;
        ['name', 'category', 'description', 'fee', 'duration', 'trail', 'expectations', 'terrain', 'startPoint'].forEach((field) => {
          document.getElementById(`local-attraction-${field}`).value = item[field] || '';
        });
        const imageInput = document.getElementById('local-attraction-images');
        imageInput.value = '';
        renderAttractionPhotoList(document.getElementById('local-existing-photos'), item.images);
        window.AdminTransportFeature.loadOptions(document.getElementById('local-transport-options'), item.transportOptions || []);
        const coords = Array.isArray(item.coords) ? item.coords : [];
        document.getElementById('local-attraction-latitude').value = coords[0] ?? '';
        document.getElementById('local-attraction-longitude').value = coords[1] ?? '';
        document.getElementById('local-location-status').textContent = coords.length === 2
          ? `Lat ${coords[0]}, Lng ${coords[1]}` : 'Choose a pin location first.';
        document.getElementById('local-attraction-heading').textContent = 'Edit attraction';
        document.querySelector('[data-barangay-tab="add-attraction"]')?.click();
        document.getElementById('local-attraction-form').scrollIntoView({ behavior: 'smooth' });
      });
    });
    document.getElementById('local-submissions').innerHTML = [...attractionProposals, ...shopProposals]
      .map((item) => `<article class="dashboard-card"><h4>${escapeHtml(item.payload.name)}</h4>
        <p>${escapeHtml(item.status)} — ${escapeHtml(barangays.find((area) => area.id === item.barangay_id)?.name || item.barangay_id)}</p></article>`).join('')
      || '<p class="empty-state">No submissions yet.</p>';
  }

  function setupLocalForms() {
    const attractionForm = document.getElementById('local-attraction-form');
    const value = (id) => document.getElementById(id).value.trim();
    const transportOptions = document.getElementById('local-transport-options');
    document.getElementById('local-add-transport').addEventListener('click', () => window.AdminTransportFeature.addRow(transportOptions));
    const latitude = document.getElementById('local-attraction-latitude');
    const longitude = document.getElementById('local-attraction-longitude');
    const locationStatus = document.getElementById('local-location-status');
    const modal = document.getElementById('local-pin-modal');
    const pinStatus = document.getElementById('local-pin-status');
    const confirmPin = document.getElementById('local-confirm-location');
    let map;
    let marker;
    let draft;
    const updateLocationStatus = () => {
      locationStatus.textContent = latitude.value && longitude.value
        ? `Lat ${latitude.value}, Lng ${longitude.value}` : 'Choose a pin location first.';
    };
    latitude.addEventListener('input', updateLocationStatus);
    longitude.addEventListener('input', updateLocationStatus);
    document.getElementById('local-choose-location').addEventListener('click', () => {
      if (!window.L) return showError(document.getElementById('local-attraction-message'), new Error('The map could not load. Enter coordinates manually or try again.'));
      modal.hidden = false;
      if (!map) {
        map = window.L.map('local-pin-map', { zoomControl: true, scrollWheelZoom: true }).setView([14.73, 121.15], 13);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
        map.on('click', (event) => {
          draft = [event.latlng.lat, event.latlng.lng];
          if (marker) map.removeLayer(marker);
          marker = window.L.marker(draft).addTo(map);
          marker.bindTooltip('Selected pin location');
          pinStatus.textContent = `Selected location: ${draft[0].toFixed(5)}, ${draft[1].toFixed(5)}`;
          confirmPin.disabled = false;
        });
      }
      if (marker) {
        map.removeLayer(marker);
        marker = null;
      }
      draft = latitude.value && longitude.value ? [Number(latitude.value), Number(longitude.value)] : null;
      confirmPin.disabled = !draft;
      pinStatus.textContent = draft ? `Selected location: ${draft[0].toFixed(5)}, ${draft[1].toFixed(5)}` : 'No location selected yet.';
      if (draft) {
        marker = window.L.marker(draft).addTo(map);
        map.setView(draft, 13);
      }
      window.setTimeout(() => map.invalidateSize(), 0);
    });
    document.getElementById('local-cancel-location').addEventListener('click', () => { modal.hidden = true; });
    confirmPin.addEventListener('click', () => {
      if (!draft) return;
      latitude.value = draft[0].toFixed(6);
      longitude.value = draft[1].toFixed(6);
      updateLocationStatus();
      modal.hidden = true;
    });
    const resetAttraction = () => {
      attractionForm.reset();
      document.getElementById('local-attraction-id').value = '';
      document.getElementById('attraction-area').disabled = false;
      window.AdminTransportFeature.loadOptions(transportOptions, []);
      document.getElementById('local-existing-photos').innerHTML = '';
      document.getElementById('local-attraction-heading').textContent = 'Propose an attraction';
      updateLocationStatus();
    };
    document.getElementById('local-attraction-cancel').addEventListener('click', resetAttraction);
    attractionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (attractionForm.dataset.saving === 'true') return;
      attractionForm.dataset.saving = 'true';
      const message = document.getElementById('local-attraction-message');
      try {
        const id = value('local-attraction-id');
        if (!latitude.value || !longitude.value || !Number.isFinite(Number(latitude.value)) || !Number.isFinite(Number(longitude.value))
            || Math.abs(Number(latitude.value)) > 90 || Math.abs(Number(longitude.value)) > 180) {
          return showError(message, new Error('Choose a valid attraction location before saving.'));
        }
        const payload = {
          name: value('local-attraction-name'), category: value('local-attraction-category'),
          description: value('local-attraction-description'), fee: value('local-attraction-fee'),
          duration: value('local-attraction-duration'),
          trail: value('local-attraction-trail'), expectations: value('local-attraction-expectations'),
          terrain: value('local-attraction-terrain'), startPoint: value('local-attraction-startPoint'),
          images: await collectAttractionPhotos(document.getElementById('local-existing-photos'), document.getElementById('local-attraction-images')),
          transportOptions: window.AdminTransportFeature.readOptions(transportOptions),
          coords: [Number(value('local-attraction-latitude')), Number(value('local-attraction-longitude'))]
        };
        const result = id
          ? await supabaseClient.from('attractions').update(payload).eq('id', id).select('id').maybeSingle()
          : await supabaseClient.from('attraction_submissions').insert({ barangay_id: value('attraction-area'), payload });
        if (result.error) return showError(message, result.error);
        if (id && !result.data) return showError(message, new Error('Attraction was not updated. Refresh and try again.'));
        resetAttraction();
        message.textContent = id ? 'Attraction updated.' : 'Attraction submitted for municipal approval.';
        message.hidden = false;
        try { await loadDashboard(); } catch (error) { showError(message, new Error(`Saved, but the dashboard could not refresh: ${error.message}`)); }
      } catch (error) {
        showError(message, error);
      } finally {
        delete attractionForm.dataset.saving;
      }
    });
    const shopForm = document.getElementById('local-shop-form');
    const shopImage = document.getElementById('local-shop-image');
    shopForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (shopForm.dataset.saving === 'true') return;
      shopForm.dataset.saving = 'true';
      const message = document.getElementById('local-shop-message');
      let uploadedPhoto;
      let submitted = false;
      try {
        const payload = Object.fromEntries(['name', 'price', 'description', 'availability']
          .map((field) => [field, value(`local-shop-${field}`)]));
        uploadedPhoto = await uploadShopProductPhoto(shopImage.files?.[0]);
        payload.image = uploadedPhoto?.url || '';
        const { error } = await supabaseClient.from('shop_submissions').insert({ barangay_id: value('shop-area'), payload });
        if (error) throw error;
        submitted = true;
        shopForm.reset();
        message.textContent = 'Product submitted for municipal approval.';
        message.hidden = false;
        try { await loadDashboard(); } catch (error) { showError(message, new Error(`Submitted, but the dashboard could not refresh: ${error.message}`)); }
      } catch (error) {
        let detail = error?.message || String(error);
        if (uploadedPhoto && !submitted) {
          try { await removeShopProductPhoto(uploadedPhoto.path); } catch (cleanupError) {
            console.error('Unable to remove a product picture after a failed submission.', cleanupError);
            detail += ` Picture cleanup failed: ${cleanupError.message}`;
          }
        }
        showError(message, new Error(detail));
      } finally {
        delete shopForm.dataset.saving;
      }
    });
  }

  function renderBookings(bookings, attractions, guides) {
    const list = document.getElementById('barangay-bookings');
    if (!bookings.length) {
      list.innerHTML = '<p class="empty-state">No attraction bookings in your assigned barangays.</p>';
      return;
    }
    list.innerHTML = bookings.map((booking) => `
      <article class="dashboard-card">
        <h3>${escapeHtml(booking.travelerName || booking.traveler_name || 'Visitor')} — ${escapeHtml(attractions.get(booking.attractionId) || booking.attractionName || 'Attraction')}</h3>
        <p><strong>Date:</strong> ${escapeHtml(booking.date || 'Not specified')} ${escapeHtml(booking.time || '')}</p>
        <p><strong>Visitors:</strong> ${Number(booking.adults || 0) + Number(booking.kids || 0) + Number(booking.pwd || 0)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
        <p><strong>Status:</strong> ${escapeHtml(booking.status || 'Pending')}</p>
        <p><strong>Guide:</strong> ${escapeHtml(booking.assignedGuide || 'Not assigned')}</p>
        ${booking.status === 'Pending' ? `
          <div class="attraction-management-actions">
            <button class="btn btn-primary" type="button" data-booking-decision="Approved" data-booking-id="${escapeHtml(booking.id)}">Approve</button>
            <button class="btn btn-secondary" type="button" data-booking-decision="Rejected" data-booking-id="${escapeHtml(booking.id)}">Decline</button>
          </div>` : ''}
        ${['Approved', 'Assigned'].includes(booking.status) ? `
          <label for="guide-${escapeHtml(booking.id)}">Assign guide</label>
          <select id="guide-${escapeHtml(booking.id)}" data-guide-booking="${escapeHtml(booking.id)}">
            <option value="">Not assigned</option>
            ${guides.filter((guide) => guide.barangay_id === booking.barangay_id).map((guide) => `<option value="${escapeHtml(guide.id)}" ${booking.guide_id === guide.id ? 'selected' : ''}>${escapeHtml(guide.name)} — ${escapeHtml(guide.specialty || 'Guide')}</option>`).join('')}
          </select>
          <button class="btn btn-secondary" type="button" data-save-guide="${escapeHtml(booking.id)}">Save guide assignment</button>` : ''}
        <p data-booking-error="${escapeHtml(booking.id)}" class="success-message error-message" role="alert" hidden></p>
      </article>
    `).join('');

    list.querySelectorAll('[data-booking-decision]').forEach((button) => {
      button.addEventListener('click', async () => {
        const { error } = await supabaseClient.from('bookings')
          .update({ status: button.dataset.bookingDecision })
          .eq('id', button.dataset.bookingId);
        if (error) return showError(list.querySelector(`[data-booking-error="${CSS.escape(button.dataset.bookingId)}"]`), error);
        await loadDashboard();
      });
    });
    list.querySelectorAll('[data-save-guide]').forEach((button) => {
      button.addEventListener('click', async () => {
        const bookingId = button.dataset.saveGuide;
        const booking = bookings.find((item) => item.id === bookingId);
        const select = list.querySelector(`[data-guide-booking="${CSS.escape(bookingId)}"]`);
        const guide = guides.find((item) => item.id === select.value && item.barangay_id === booking.barangay_id);
        if (select.value && !guide) return showError(list.querySelector(`[data-booking-error="${CSS.escape(bookingId)}"]`), new Error('Select a guide from this barangay.'));
        const { data, error } = await supabaseClient.from('bookings')
          .update({ guide_id: guide?.id || null, assignedGuide: guide?.name || '', status: guide ? 'Assigned' : 'Approved' })
          .eq('id', bookingId).eq('status', booking.status).select('id').maybeSingle();
        if (error) return showError(list.querySelector(`[data-booking-error="${CSS.escape(bookingId)}"]`), error);
        if (!data) return showError(list.querySelector(`[data-booking-error="${CSS.escape(bookingId)}"]`), new Error('This booking changed. Refresh and try again.'));
        await loadDashboard();
      });
    });
  }

  function renderSubmissions(submissions, barangays) {
    const list = document.getElementById('barangay-resort-submissions');
    if (!submissions.length) {
      list.innerHTML = '<p class="empty-state">No resort listings are waiting for review.</p>';
      return;
    }
    list.innerHTML = submissions.map((submission, index) => `
      <article class="dashboard-card">
        <h3>${escapeHtml(submission.name)}</h3>
        <div class="resort-photos" data-resort-photo-index="${index}"></div>
        <p><strong>Barangay:</strong> ${escapeHtml(barangays.get(submission.barangay_id) || submission.barangay_id)}</p>
        <p>${escapeHtml(submission.description || '')}</p>
        <p><strong>Address:</strong> ${escapeHtml(submission.address || 'Not provided')}</p>
        ${resortProfileMarkup(submission)}
        <p><strong>Services and fees:</strong><br>${serviceSummary(submission.services) || 'None listed'}</p>
        <div class="attraction-management-actions">
          <button class="btn btn-primary" type="button" data-review-listing="approve" data-submission-id="${escapeHtml(submission.id)}">Approve listing</button>
          <button class="btn btn-secondary" type="button" data-review-listing="reject" data-submission-id="${escapeHtml(submission.id)}">Reject</button>
        </div>
        <p data-submission-error="${escapeHtml(submission.id)}" class="success-message error-message" role="alert" hidden></p>
      </article>
    `).join('');

    renderResortPhotoContainers(list, submissions);
    list.querySelectorAll('[data-review-listing]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.submissionId;
        const approved = button.dataset.reviewListing === 'approve';
        const { error } = await supabaseClient.rpc(
          approved ? 'approve_resort_submission' : 'reject_resort_submission',
          approved ? { submission_id: id } : { submission_id: id, note: '' }
        );
        if (error) return showError(list.querySelector(`[data-submission-error="${CSS.escape(id)}"]`), error);
        await loadDashboard();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      showError(signInMessage, new Error('Connect this app to Supabase before signing in.'));
      return;
    }
    setupLocalForms();
    signInForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: document.getElementById('barangay-email').value.trim(),
        password: document.getElementById('barangay-password').value
      });
      if (error) return showError(signInMessage, error);
      try {
        await loadDashboard();
      } catch (error) {
        showError(dashboard.hidden ? signInMessage : accessMessage, error);
      }
    });
    signOutButton.addEventListener('click', async () => {
      const { error } = await supabaseClient.auth.signOut();
      if (error) return showError(accessMessage, error);
      window.location.reload();
    });
    try {
      await loadDashboard();
    } catch (error) {
      showError(dashboard.hidden ? signInMessage : accessMessage, error);
    }
  });
})();
