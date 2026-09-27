// Tourist booking submission feature.
(function () {
  function setupBookingFeature(state) {
    const form = document.getElementById('booking-form');
    if (!form || form.dataset.featureBound === 'true') return;

    form.dataset.featureBound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!(appState?.attractions || []).length) return;

      const booking = createBookingFromForm(form);
      const selectedAttraction = appState.attractions.find((item) => item.id === booking.attractionId);
      await updateState((currentState) => ({
        ...currentState,
        bookings: [...currentState.bookings, booking]
      }));

      const success = document.getElementById('booking-success');
      if (success) success.hidden = false;

      const warning = document.getElementById('booking-sync-warning');
      if (warning) {
        if (window.lastSyncErrors?.bookings) {
          warning.textContent = 'Your contact number and party size were saved on this device only. Reopening the booking on another device may show them as "Not provided" until the shared database is updated.';
          warning.hidden = false;
        } else {
          warning.hidden = true;
        }
      }

      form.reset();
      if (selectedAttraction) {
        window.UserAttractionsFeature?.select?.(selectedAttraction);
      }
    });
  }

  window.UserBookingFeature = {
    setup: setupBookingFeature
  };
})();
