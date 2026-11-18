(function () {
  const message = () => document.getElementById('local-admin-message');

  function showMessage(text, isError = false) {
    const element = message();
    element.textContent = text;
    element.classList.toggle('error-message', isError);
    element.hidden = false;
  }

  function renderBarangayOptions(barangays) {
    const select = document.getElementById('new-barangay-admin-areas');
    select.innerHTML = barangays.map((barangay) =>
      `<option value="${escapeHtml(barangay.id)}">${escapeHtml(barangay.name)}</option>`
    ).join('');
  }

  async function loadReviews() {
    const [barangaysResult, applicationsResult, submissionsResult, attractionProposals, shopProposals, attractionsResult] = await Promise.all([
      supabaseClient.from('barangays').select('id,name').order('name'),
      supabaseClient.from('resort_manager_applications').select('id,email,name,contact,resort,created_at').eq('status', 'Pending').order('created_at'),
      supabaseClient.from('resort_submissions').select('*').eq('status', 'Pending').order('created_at'),
      supabaseClient.from('attraction_submissions').select('*').eq('status', 'Pending').order('created_at'),
      supabaseClient.from('shop_submissions').select('*').eq('status', 'Pending').order('created_at'),
      supabaseClient.from('attractions').select('id,name,barangay_id').order('name')
    ]);
    for (const result of [barangaysResult, applicationsResult, submissionsResult, attractionProposals, shopProposals, attractionsResult]) {
      if (result.error) throw result.error;
    }
    renderBarangayOptions(barangaysResult.data);
    renderApplications(applicationsResult.data);
    renderSubmissions(submissionsResult.data, barangaysResult.data);
    renderProposals('attraction', attractionProposals.data, barangaysResult.data);
    renderProposals('shop', shopProposals.data, barangaysResult.data);
    renderAttractionAreas(attractionsResult.data, barangaysResult.data);
  }

  function renderProposals(type, submissions, barangays) {
    const list = document.getElementById(`municipal-${type}-proposals`);
    const areas = new Map(barangays.map((area) => [area.id, area.name]));
    list.innerHTML = submissions.map((item) => {
      const payload = item.payload;
      const details = type === 'attraction'
        ? `<p><strong>Category:</strong> ${escapeHtml(payload.category)}<br><strong>Location:</strong> ${escapeHtml(payload.coords.join(', '))}<br><strong>Fee:</strong> ${escapeHtml(payload.fee || 'Not specified')}<br><strong>Duration:</strong> ${escapeHtml(payload.duration || 'Not specified')}</p>
          <p><strong>Trail:</strong> ${escapeHtml(payload.trail || 'Not specified')}<br><strong>Expectations:</strong> ${escapeHtml(payload.expectations || 'Not specified')}<br><strong>Terrain:</strong> ${escapeHtml(payload.terrain || 'Not specified')}<br><strong>Starting point:</strong> ${escapeHtml(payload.startPoint || 'Not specified')}</p>
          <p><strong>Images:</strong> ${escapeHtml((payload.images || []).join(', ') || 'None')}<br><strong>Transport:</strong> ${escapeHtml((payload.transportOptions || []).map((option) => [option.mode, option.fare, option.time, option.route].filter(Boolean).join(' — ')).join('; ') || 'None')}</p>`
        : `<p><strong>Price:</strong> ${escapeHtml(payload.price)}<br><strong>Availability:</strong> ${escapeHtml(payload.availability)}<br><strong>Image:</strong> ${escapeHtml(payload.image || 'None')}</p>`;
      return `<article class="dashboard-card"><h4>${escapeHtml(payload.name)}</h4>
        <p><strong>Barangay:</strong> ${escapeHtml(areas.get(item.barangay_id) || item.barangay_id)}</p>
        <p>${escapeHtml(payload.description || '')}</p>${details}
        <button class="btn btn-primary" type="button" data-approval-id="${escapeHtml(item.id)}" data-approval-decision="true">Approve</button>
        <button class="btn btn-secondary" type="button" data-approval-id="${escapeHtml(item.id)}" data-approval-decision="false">Reject</button>
      </article>`;
    }).join('') || '<p class="empty-state">No submissions awaiting review.</p>';
    list.querySelectorAll('[data-approval-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const approved = button.dataset.approvalDecision === 'true';
        if (!window.confirm(`${approved ? 'Approve' : 'Reject'} this submission?`)) return;
        button.disabled = true;
        try {
          const { error } = await supabaseClient.rpc(`review_${type}_submission`, {
            submission_id: button.dataset.approvalId, approved
          });
          if (error) throw error;
          showMessage(`Submission ${approved ? 'approved' : 'rejected'}.`);
          try {
            await loadReviews();
            if (approved) {
              appState = await loadStateFromSupabase();
              await renderApp(appState);
            }
          } catch (refreshError) {
            showMessage(`Review saved, but the dashboard could not refresh: ${refreshError.message}`, true);
          }
        } catch (error) {
          showMessage(error.message, true);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function renderAttractionAreas(attractions, barangays) {
    const list = document.getElementById('municipal-attraction-areas');
    list.innerHTML = attractions.map((item) => `<article class="dashboard-card">
      <h4>${escapeHtml(item.name)}</h4>
      <label for="area-${escapeHtml(item.id)}">Barangay</label>
      <select id="area-${escapeHtml(item.id)}" data-area-select="${escapeHtml(item.id)}">
        <option value="">Unassigned</option>
        ${barangays.map((area) => `<option value="${escapeHtml(area.id)}" ${area.id === item.barangay_id ? 'selected' : ''}>${escapeHtml(area.name)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary" type="button" data-save-area="${escapeHtml(item.id)}">Save barangay</button>
    </article>`).join('') || '<p class="empty-state">No attractions yet.</p>';
    list.querySelectorAll('[data-save-area]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.saveArea;
        const area = list.querySelector(`[data-area-select="${CSS.escape(id)}"]`).value;
        const { data, error } = await supabaseClient.from('attractions')
          .update({ barangay_id: area || null }).eq('id', id).select('id').maybeSingle();
        if (error || !data) return showMessage(error?.message || 'Attraction was not updated.', true);
        showMessage('Attraction barangay saved.');
        try { await loadReviews(); } catch (loadError) { showMessage(loadError.message, true); }
      });
    });
  }

  function renderApplications(applications) {
    const list = document.getElementById('resort-manager-applications');
    if (!applications.length) {
      list.innerHTML = '<p class="empty-state">No resort owner accounts are waiting for approval.</p>';
      return;
    }
    list.innerHTML = applications.map((application) => {
      const resort = application.resort || {};
      const services = Array.isArray(resort.services) ? resort.services : [];
      return `
        <article class="dashboard-card">
          <h3>${escapeHtml(application.name)}</h3>
          <p><strong>Email:</strong> ${escapeHtml(application.email)}</p>
          <p><strong>Contact:</strong> ${escapeHtml(application.contact || 'Not provided')}</p>
          <p><strong>Resort:</strong> ${escapeHtml(resort.name || 'Not provided')}</p>
          <p><strong>Barangay:</strong> ${escapeHtml(resort.barangayId || 'Not provided')}</p>
          <p><strong>Services offered:</strong> ${services.map((service) => `${escapeHtml(service.name)} (₱${Number(service.fee).toLocaleString('en-PH')})`).join(', ') || 'None listed'}</p>
          <div class="attraction-management-actions">
            <button class="btn btn-primary" type="button" data-manager-review="true" data-application-id="${escapeHtml(application.id)}">Approve owner account</button>
            <button class="btn btn-secondary" type="button" data-manager-review="false" data-application-id="${escapeHtml(application.id)}">Reject</button>
          </div>
          <p data-local-error="${escapeHtml(application.id)}" class="success-message error-message" role="alert" hidden></p>
        </article>`;
    }).join('');

    list.querySelectorAll('[data-manager-review]').forEach((button) => {
      button.addEventListener('click', async () => {
        const approved = button.dataset.managerReview === 'true';
        if (!window.confirm(`${approved ? 'Approve' : 'Reject'} this resort owner account?`)) return;
        const id = button.dataset.applicationId;
        const { error } = await supabaseClient.rpc('review_resort_manager_application', {
          application_id: id,
          approved,
          note: ''
        });
        if (error) {
          const warning = list.querySelector(`[data-local-error="${CSS.escape(id)}"]`);
          warning.textContent = error.message;
          warning.hidden = false;
          return;
        }
        showMessage(approved ? 'Owner account approved. Their first resort listing is now waiting for barangay review.' : 'Owner account rejected.');
        await loadReviews();
      });
    });
  }

  function renderSubmissions(submissions, barangays) {
    const list = document.getElementById('municipal-resort-submissions');
    const areas = new Map(barangays.map((barangay) => [barangay.id, barangay.name]));
    if (!submissions.length) {
      list.innerHTML = '<p class="empty-state">No resort listings are waiting for review.</p>';
      return;
    }
    list.innerHTML = submissions.map((submission) => `
      <article class="dashboard-card">
        <h3>${escapeHtml(submission.name)}</h3>
        <p><strong>Barangay:</strong> ${escapeHtml(areas.get(submission.barangay_id) || submission.barangay_id)}</p>
        <p>${escapeHtml(submission.description || '')}</p>
        ${resortProfileMarkup(submission)}
        <p><strong>Services and fees:</strong><br>${(submission.services || []).map((service) => `${escapeHtml(service.name)} — ₱${Number(service.fee).toLocaleString('en-PH')} / ${escapeHtml(service.pricingUnit)}`).join('<br>')}</p>
        <div class="attraction-management-actions">
          <button class="btn btn-primary" type="button" data-municipal-review="approve" data-submission-id="${escapeHtml(submission.id)}">Approve listing</button>
          <button class="btn btn-secondary" type="button" data-municipal-review="reject" data-submission-id="${escapeHtml(submission.id)}">Reject listing</button>
        </div>
        <p data-listing-error="${escapeHtml(submission.id)}" class="success-message error-message" role="alert" hidden></p>
      </article>
    `).join('');
    list.querySelectorAll('[data-municipal-review]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.submissionId;
        const approve = button.dataset.municipalReview === 'approve';
        const { error } = await supabaseClient.rpc(
          approve ? 'approve_resort_submission' : 'reject_resort_submission',
          approve ? { submission_id: id } : { submission_id: id, note: 'Municipal Admin intervention' }
        );
        if (error) {
          const warning = list.querySelector(`[data-listing-error="${CSS.escape(id)}"]`);
          warning.textContent = error.message;
          warning.hidden = false;
          return;
        }
        showMessage('Resort listing review saved.');
        await loadReviews();
      });
    });
  }

  function setup() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      showMessage('Connect this app to Supabase to manage local admin accounts.', true);
      return;
    }
    const barangayForm = document.getElementById('create-barangay-form');
    const adminForm = document.getElementById('create-barangay-admin-form');
    if (!barangayForm || barangayForm.dataset.bound === 'true') return;
    barangayForm.dataset.bound = 'true';
    adminForm.dataset.bound = 'true';
    barangayForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = document.getElementById('new-barangay-name').value.trim();
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!id) return showMessage('Use a barangay name with letters or numbers.', true);
      const { error } = await supabaseClient.from('barangays').insert({ id, name });
      if (error) return showMessage(error.message, true);
      barangayForm.reset();
      showMessage(`${name} added.`);
      await loadReviews();
    });
    adminForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const barangayIds = Array.from(document.getElementById('new-barangay-admin-areas').selectedOptions, (option) => option.value);
      if (!barangayIds.length) return showMessage('Select at least one barangay.', true);
      const { data, error } = await supabaseClient.functions.invoke('local-accounts', {
        body: {
          action: 'create-barangay-admin',
          name: document.getElementById('new-barangay-admin-name').value.trim(),
          email: document.getElementById('new-barangay-admin-email').value.trim(),
          password: document.getElementById('new-barangay-admin-password').value,
          barangayIds
        }
      });
      if (error || !data?.ok) return showMessage(await getFunctionErrorMessage(data, error, 'Admin account could not be created.'), true);
      adminForm.reset();
      showMessage('Barangay Admin account created and assigned. Share the temporary password securely.');
    });
    loadReviews().catch((error) => showMessage(error.message, true));
  }

  window.LocalAdminFeature = { setup };
})();
