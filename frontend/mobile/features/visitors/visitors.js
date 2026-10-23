// Guide visitor list: upcoming travelers for the signed-in guide
(function () {
  function renderGuideVisitors(state, currentGuide) {
    const visitorList = document.getElementById('guide-visitors-list');
    if (!visitorList) return;

    visitorList.innerHTML = '';
    state.bookings.filter((booking) => currentGuide && booking.guide_id === currentGuide && booking.status !== 'Completed').slice(0, 3).forEach((booking) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        <h3>${escapeHtml(booking.travelerName)}</h3>
        <p>${escapeHtml(booking.attractionName)}</p>
        <p>${escapeHtml(booking.date)}</p>
        <p>${escapeHtml(booking.status)}</p>
      `;
      visitorList.appendChild(card);
    });
  }

  window.GuideVisitorsFeature = {
    render: renderGuideVisitors
  };
})();
