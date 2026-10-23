// Guide daily schedule: upcoming assigned tours
(function () {
  function renderGuideSchedule(state, currentGuide) {
    const scheduleList = document.getElementById('guide-schedule-list');
    if (!scheduleList) return;

    const scheduledBookings = state.bookings
      .filter((booking) => currentGuide && booking.guide_id === currentGuide && ['Assigned', 'Confirmed', 'Ongoing'].includes(booking.status))
      .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
    scheduleList.innerHTML = '';
    if (!scheduledBookings.length) {
      scheduleList.innerHTML = '<p>No approved tours have been scheduled yet.</p>';
    }
    scheduledBookings.forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      const attraction = state.attractions.find((item) => item.id === booking.attractionId);
      card.innerHTML = `<h3>${escapeHtml(booking.date)}${booking.time ? ` at ${escapeHtml(booking.time)}` : ''}</h3>
        <p><strong>Attraction:</strong> ${escapeHtml(booking.attractionName || '')}</p>
        <p><strong>Traveler:</strong> ${escapeHtml(booking.travelerName || '')}</p>
        <p><strong>Party:</strong> ${booking.adults || 0} adult(s), ${booking.kids || 0} child(ren), ${booking.pwd || 0} PWD</p>
        <p><strong>Meeting point:</strong> ${escapeHtml(booking.meetingPoint || attraction?.startPoint || 'To be confirmed')}</p>
        ${booking.guideNote ? `<p><strong>Note from admin:</strong> ${escapeHtml(booking.guideNote)}</p>` : ''}
        <p>${escapeHtml(booking.scheduleNotes || '')}</p>
        <div class="filter-row">
          ${booking.status === 'Ongoing' ? '<button class="btn btn-secondary" type="button" disabled>Pending</button>' : '<button class="btn btn-secondary" type="button" data-schedule-start>Start tour</button>'}
          <button class="btn btn-primary" type="button" data-schedule-complete ${booking.status === 'Ongoing' ? '' : 'disabled'}>Complete tour</button>
        </div>`;
      card.querySelector('[data-schedule-start]')?.addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => item.id === booking.id ? { ...item, status: 'Ongoing' } : item)
        }));
      });
      card.querySelector('[data-schedule-complete]')?.addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          bookings: currentState.bookings.map((item) => item.id === booking.id ? { ...item, status: 'Completed' } : item)
        }));
      });
      scheduleList.appendChild(card);
    });
  }

  window.GuideScheduleFeature = {
    render: renderGuideSchedule
  };
})();
