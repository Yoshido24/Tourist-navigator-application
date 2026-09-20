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
      form.reset();
      const place = document.getElementById('place');
      if (place && selectedAttraction) {
        place.value = selectedAttraction.id;
        place.dispatchEvent(new Event('change'));
      }
    });
  }

  window.UserBookingFeature = {
    setup: setupBookingFeature
  };
})();
