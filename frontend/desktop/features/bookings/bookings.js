(function () {
  function sortByDateTime(items) {
    return [...items].sort((a, b) => `${a.date || ''} ${a.time || ''}`.localeCompare(`${b.date || ''} ${b.time || ''}`));
  }

  function renderManagement(state) {
    const render = (id, bookings, emptyText) => {
      const list = document.getElementById(id);
      if (!list) return;
      list.innerHTML = bookings.map((booking) => `
        <article class="dashboard-card">
          <h3>${escapeHtml(booking.attractionName || booking.service_name || 'Tour')}</h3>
          <p><strong>Traveler:</strong> ${escapeHtml(booking.travelerName || 'Guest')}</p>
          <p><strong>Contact:</strong> ${escapeHtml(booking.contact || 'Not provided')}</p>
          <p><strong>Party:</strong> ${Number(booking.adults || 0)} adult(s), ${Number(booking.kids || 0)} child(ren), ${Number(booking.pwd || 0)} PWD</p>
          <p><strong>Date:</strong> ${escapeHtml(booking.date || 'Not scheduled')}${booking.time ? ` at ${escapeHtml(booking.time)}` : ''}</p>
          <p><strong>Status:</strong> ${escapeHtml(booking.status || 'Pending')}</p>
          <p><strong>Guide:</strong> ${escapeHtml(booking.assignedGuide || 'Not assigned')}</p>
          ${booking.guideNote ? `<p><strong>Note for guide:</strong> ${escapeHtml(booking.guideNote)}</p>` : ''}
        </article>`).join('') || `<p class="empty-state">${emptyText}</p>`;
    };
    const bookings = sortByDateTime(state.bookings);
    render('management-new-list', bookings.filter((item) => item.status === 'Pending'), 'No new bookings.');
    render('management-approved-list', bookings.filter((item) => item.status === 'Approved'), 'No approved bookings.');
    render('management-pending-list', bookings.filter((item) => ['Assigned', 'Confirmed', 'Ongoing'].includes(item.status)), 'No tours pending completion.');
    render('management-completed-list', [...bookings].reverse(), 'No bookings yet.');
  }

  window.AdminBookingsFeature = { renderManagement };
})();
