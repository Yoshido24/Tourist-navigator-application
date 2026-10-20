// Guide completed-tour bookings: history of completed tours
(function () {
  function renderGuideBookings(state, currentGuide) {
    const bookingList = document.getElementById('guide-bookings-list');
    if (!bookingList) return;

    const syncWarning = document.getElementById('guide-bookings-sync-warning');
    if (syncWarning) {
      if (window.lastSyncErrors?.bookings) {
        syncWarning.textContent = 'Some bookings could not fully sync to the shared database. Contact numbers and party sizes may show as "Not provided" until the latest database migration is run.';
        syncWarning.hidden = false;
      } else {
        syncWarning.hidden = true;
      }
    }

    bookingList.innerHTML = '';
    const assignedBookings = state.bookings
      .filter((booking) => currentGuide && booking.assignedGuide === currentGuide && booking.status === 'Completed')
      .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
    if (!assignedBookings.length) {
      bookingList.innerHTML = '<p class="empty-state">No bookings assigned to you yet.</p>';
    }
    assignedBookings.forEach((booking) => {
      const attraction = state.attractions.find((item) => item.id === booking.attractionId);
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${escapeHtml(booking.attractionName)}</h3>
        <p><strong>Traveler:</strong> ${escapeHtml(booking.travelerName)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
        <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
        <p><strong>Date:</strong> ${escapeHtml(booking.date)}${booking.time ? ` at ${escapeHtml(booking.time)}` : ''}</p>
        <p><strong>Status:</strong> ${escapeHtml(booking.status)}</p>
        <p><strong>Meeting point:</strong> ${escapeHtml(booking.meetingPoint || attraction?.startPoint || 'To be confirmed')}</p>
        ${booking.guideNote ? `<p><strong>Note from admin:</strong> ${escapeHtml(booking.guideNote)}</p>` : ''}
        ${attraction?.transportOptions?.length ? `<p><strong>Getting there:</strong> ${attraction.transportOptions.map((option) => `${escapeHtml(option.mode)}: ${escapeHtml(option.fare)}`).join(' • ')}</p>` : ''}
        <p>${escapeHtml(booking.notes)}</p>
      `;
      bookingList.appendChild(card);
    });
  }

  window.GuideBookingsFeature = {
    render: renderGuideBookings
  };
})();
