// Admin booking approval, guide assignment, and management lists
(function () {
  function renderAdminBookingsList(state) {
    const adminBookingsList = document.getElementById('admin-bookings-list');
    if (!adminBookingsList) return;

    adminBookingsList.innerHTML = '';
    state.bookings.forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${escapeHtml(booking.attractionName)}</h3>
        <p><strong>Traveler:</strong> ${escapeHtml(booking.travelerName)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
        <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
        <p><strong>Date:</strong> ${escapeHtml(booking.date)}</p>
        <p><strong>Status:</strong> ${escapeHtml(booking.status)}</p>
        <p><strong>Guide:</strong> ${escapeHtml(booking.assignedGuide || 'Not assigned yet')}</p>
        <p>${escapeHtml(booking.notes)}</p>
        <div class="filter-row">
          <button class="btn btn-secondary" type="button" data-contact-traveler ${booking.contact ? '' : 'disabled'}>Contact traveler</button>
          <button class="btn btn-secondary" type="button" data-booking-action="mark-contacted" ${booking.contact ? '' : 'disabled'}>Mark contacted</button>
          <button class="btn btn-secondary" type="button" data-booking-action="approve">Approve</button>
          <select class="booking-form-input" data-guide-select aria-label="Select guide">
            <option value="">Select guide</option>
            ${state.guides.filter((guide) => guide.status !== 'Pending').map((guide) => `<option value="${escapeHtml(guide.id)}">${escapeHtml(guide.name)}</option>`).join('')}
          </select>
          <button class="btn btn-primary" type="button" data-booking-action="assign" disabled>Assign guide</button>
        </div>
      `;

      const approveButton = card.querySelector('[data-booking-action="approve"]');
      card.querySelector('[data-booking-action="mark-contacted"]')?.addEventListener('click', (event) => {
        event.currentTarget.textContent = 'Contacted';
        event.currentTarget.disabled = true;
        approveButton.disabled = false;
      });
      card.querySelector('[data-contact-traveler]')?.addEventListener('click', () => {
        if (booking.contact) window.location.href = `tel:${booking.contact}`;
      });
      approveButton.addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (item.id === booking.id ? { ...item, status: 'Approved' } : item))
        }));
      });

      card.querySelector('[data-booking-action="assign"]').addEventListener('click', async () => {
        const guideSelect = card.querySelector('[data-guide-select]');
        const selectedGuide = guideSelect?.value;
        if (!selectedGuide) {
          return;
        }
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => (
            item.id === booking.id
              ? { ...item, status: 'Assigned', ...guideAssignment(currentState, selectedGuide) }
              : item
          ))
        }));
      });
      card.querySelector('[data-guide-select]')?.addEventListener('change', (event) => {
        card.querySelector('[data-booking-action="assign"]').disabled = !event.currentTarget.value;
      });

      adminBookingsList.appendChild(card);
    });
  }

  function sortByDateTime(items) {
    return [...items].sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));
  }

  let pendingAssignment = null;

  function guideAssignment(state, guideId) {
    const guide = state.guides.find((item) => item.id === guideId);
    return { guide_id: guideId, assignedGuide: guide?.name || '' };
  }

  function openAssignGuideModal(booking, guideId) {
    const modal = document.getElementById('assign-guide-modal');
    if (!modal) return;
    const guideName = appState.guides.find((item) => item.id === guideId)?.name || 'the guide';
    pendingAssignment = { bookingId: booking.id, guideId };
    const summary = document.getElementById('assign-guide-summary');
    if (summary) {
      summary.textContent = `Assign ${guideName} to ${booking.attractionName || 'this tour'} for ${escapeHtml(booking.travelerName || 'the traveler')} on ${booking.date || 'the scheduled date'}${booking.time ? ` at ${booking.time}` : ''}.`;
    }
    const noteField = document.getElementById('assign-guide-note');
    if (noteField) noteField.value = '';
    modal.hidden = false;
  }

  function closeAssignGuideModal() {
    const modal = document.getElementById('assign-guide-modal');
    if (modal) modal.hidden = true;
    pendingAssignment = null;
  }

  function setupAssignGuideModal() {
    const modal = document.getElementById('assign-guide-modal');
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';
    modal.querySelector('[data-close-assign-guide]')?.addEventListener('click', closeAssignGuideModal);
    document.getElementById('confirm-assign-guide')?.addEventListener('click', async () => {
      if (!pendingAssignment) return;
      const { bookingId, guideId } = pendingAssignment;
      const note = document.getElementById('assign-guide-note')?.value || '';
      await updateState((currentState) => ({
        ...currentState,
        bookings: currentState.bookings.map((item) => (
          item.id === bookingId
            ? { ...item, status: 'Assigned', ...guideAssignment(currentState, guideId), guideNote: note }
            : item
        ))
      }));
      closeAssignGuideModal();
    });
  }

  function renderAdminManagementLists(state) {
    setupAssignGuideModal();
    const syncWarning = document.getElementById('management-sync-warning');
    if (syncWarning) {
      if (window.lastSyncErrors?.bookings) {
        syncWarning.textContent = 'Some bookings could not fully sync to the shared database. Contact numbers and party sizes may show as "Not provided" on other devices until the latest database migration is run.';
        syncWarning.hidden = false;
      } else {
        syncWarning.hidden = true;
      }
    }
    const managementBookingCard = (booking, view) => `
      <article class="dashboard-card" data-management-booking="${escapeHtml(booking.id)}">
        <h3>${escapeHtml(booking.attractionName || 'Tour')}</h3>
        <p><strong>Traveler:</strong> ${escapeHtml(booking.travelerName || 'Guest')}</p>
        <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
        <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
        <p><strong>Date:</strong> ${escapeHtml(booking.date || 'Not scheduled')}${booking.time ? ` at ${escapeHtml(booking.time)}` : ''}</p>
        <p><strong>Status:</strong> ${escapeHtml(booking.status || 'Pending')}</p>
        <p><strong>Guide:</strong> ${escapeHtml(booking.assignedGuide || 'Not assigned')}</p>
        ${booking.guideNote ? `<p><strong>Note for guide:</strong> ${escapeHtml(booking.guideNote)}</p>` : ''}
        ${view === 'new' ? `<div class="filter-row">
          <button class="btn btn-secondary" type="button" data-management-contact ${booking.contact ? '' : 'disabled'}>Call traveler</button>
          <button class="btn btn-primary" type="button" data-management-approve>Approve booking</button>
        </div>` : ''}
        ${view === 'approved' ? `<div class="filter-row">
          <select class="booking-form-input" data-management-guide aria-label="Select guide">
            <option value="">Select guide</option>
            ${state.guides.filter((guide) => guide.status !== 'Pending').map((guide) => `<option value="${escapeHtml(guide.id)}">${escapeHtml(guide.name)}</option>`).join('')}
          </select>
          <button class="btn btn-primary" type="button" data-management-assign disabled>Assign guide</button>
        </div>` : ''}
      </article>
    `;
    const managementLists = {
      new: document.getElementById('management-new-list'),
      approved: document.getElementById('management-approved-list'),
      pending: document.getElementById('management-pending-list'),
      completed: document.getElementById('management-completed-list')
    };
    const renderManagementList = (element, items, emptyText, view) => {
      if (!element) return;
      element.innerHTML = items.length ? items.map((booking) => managementBookingCard(booking, view)).join('') : `<p class="empty-state">${emptyText}</p>`;
      items.forEach((booking) => {
        const card = element.querySelector(`[data-management-booking="${CSS.escape(booking.id)}"]`);
        if (!card) return;
        card.querySelector('[data-management-contact]')?.addEventListener('click', () => {
          window.location.href = `tel:${booking.contact}`;
        });
        card.querySelector('[data-management-approve]')?.addEventListener('click', async () => {
          if (!window.confirm(`Approve the booking for ${booking.travelerName || 'this traveler'}?`)) return;
          await updateState((currentState) => ({
            ...currentState,
            bookings: currentState.bookings.map((item) => item.id === booking.id ? { ...item, status: 'Approved' } : item)
          }));
        });
        card.querySelector('[data-management-guide]')?.addEventListener('change', (event) => {
          card.querySelector('[data-management-assign]').disabled = !event.currentTarget.value;
        });
        card.querySelector('[data-management-assign]')?.addEventListener('click', () => {
          const selectedGuide = card.querySelector('[data-management-guide]').value;
          if (!selectedGuide) return;
          openAssignGuideModal(booking, selectedGuide);
        });
      });
    };
    renderManagementList(managementLists.new, sortByDateTime(state.bookings.filter((booking) => booking.status === 'Pending')), 'No new bookings.', 'new');
    renderManagementList(managementLists.approved, sortByDateTime(state.bookings.filter((booking) => booking.status === 'Approved')), 'No approved bookings.', 'approved');
    renderManagementList(managementLists.pending, sortByDateTime(state.bookings.filter((booking) => ['Assigned', 'Confirmed', 'Ongoing'].includes(booking.status))), 'No tours pending completion.', 'pending');
    renderManagementList(managementLists.completed, sortByDateTime(state.bookings).reverse(), 'No bookings yet.', 'completed');
  }

  window.AdminBookingsFeature = {
    renderList: renderAdminBookingsList,
    renderManagement: renderAdminManagementLists
  };
})();
