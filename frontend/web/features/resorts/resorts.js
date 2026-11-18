// Approved resort listings and service requests for the public tourist portal.
(function () {
  let currentResort = null;
  let currentState = { resorts: [] };

  function formatFee(fee, pricingUnit) {
    return `₱${Number(fee).toLocaleString('en-PH')} / ${escapeHtml(pricingUnit)}`;
  }

  function renderResorts(state) {
    const list = document.getElementById('resort-list');
    const resorts = state.resorts || [];
    if (!list) return;
    if (!resorts.length) {
      list.innerHTML = '<p class="empty-state">No resorts have been approved for listing yet.</p>';
      return;
    }

    const barangayNames = new Map((state.barangays || []).map((barangay) => [barangay.id, barangay.name]));
    list.innerHTML = resorts.map((resort) => {
      const services = Array.isArray(resort.services) ? resort.services : [];
      return `
        <article class="shop-card resort-card">
          <div class="shop-card-content">
            <h3>${escapeHtml(resort.name)}</h3>
            <p><strong>Barangay:</strong> ${escapeHtml(barangayNames.get(resort.barangay_id) || resort.address || 'Montalban')}</p>
            <p>${escapeHtml(resort.description || 'Contact the resort for details.')}</p>
            <ul class="resort-card-services">
              ${services.map((service) => `<li>${escapeHtml(service.name)} — ${formatFee(service.fee, service.pricingUnit)}</li>`).join('')}
            </ul>
            <button class="btn btn-primary" type="button" data-select-resort="${escapeHtml(resort.id)}">Choose services</button>
          </div>
        </article>`;
    }).join('');

    list.querySelectorAll('[data-select-resort]').forEach((button) => {
      button.addEventListener('click', () => {
        selectResort(button.dataset.selectResort);
      });
    });
  }

  function selectResort(resortId) {
    const resort = (currentState.resorts || []).find((item) => item.id === resortId);
    if (!resort) return false;
    currentResort = resort;
    showResortDetails(resort);
    if (typeof showUserTab === 'function') showUserTab('user-resorts');
    return true;
  }

  function showResortDetails(resort) {
    const detail = document.getElementById('resort-detail');
    const serviceSelect = document.getElementById('resort-service');
    if (!detail || !serviceSelect) return;
    const services = Array.isArray(resort.services) ? resort.services : [];
    document.getElementById('selected-resort-name').textContent = resort.name;
    document.getElementById('selected-resort-location').textContent = resort.address || '';
    document.getElementById('selected-resort-description').textContent = resort.description || '';
    document.getElementById('selected-resort-services').innerHTML = services.length
      ? `<h4>Services and fees</h4><ul>${services.map((service) => `<li>${escapeHtml(service.name)} — ${formatFee(service.fee, service.pricingUnit)}</li>`).join('')}</ul>`
      : '<p>No services are currently listed.</p>';
    serviceSelect.replaceChildren(...services.map((service) => {
      const option = document.createElement('option');
      option.value = service.id;
      option.textContent = `${service.name} — ${formatFee(service.fee, service.pricingUnit)}`;
      option.dataset.serviceType = service.type;
      return option;
    }));
    detail.hidden = false;
    updateServiceDates();
    window.UserBookingFeature?.renderCaptcha('resort-booking-captcha');
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateServiceDates() {
    const serviceSelect = document.getElementById('resort-service');
    const dateField = document.getElementById('resort-service-date-field');
    const dateInput = document.getElementById('resort-service-date');
    const stayFields = document.getElementById('resort-stay-date-fields');
    const checkIn = document.getElementById('resort-check-in');
    const checkOut = document.getElementById('resort-check-out');
    const overnight = serviceSelect?.selectedOptions[0]?.dataset.serviceType === 'overnight';
    if (dateField) dateField.hidden = overnight;
    if (dateInput) dateInput.required = !overnight;
    if (stayFields) stayFields.hidden = !overnight;
    if (checkIn) checkIn.required = Boolean(overnight);
    if (checkOut) checkOut.required = Boolean(overnight);
  }

  function setupBookingForm() {
    const form = document.getElementById('resort-booking-form');
    if (!form || form.dataset.featureBound === 'true') return;
    form.dataset.featureBound = 'true';
    document.getElementById('resort-service')?.addEventListener('change', updateServiceDates);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const errorBox = document.getElementById('resort-booking-error');
      const success = document.getElementById('resort-booking-success');
      const button = form.querySelector('[type="submit"]');
      const fail = (message) => {
        errorBox.textContent = message;
        errorBox.hidden = false;
        success.hidden = true;
      };
      errorBox.hidden = true;
      success.hidden = true;
      if (!currentResort) return fail('Choose a resort before requesting a service.');
      if (!form.elements.terms.checked) return fail('Please accept the Terms of Use and Privacy Notice.');
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        return fail('The resort booking service is not configured.');
      }

      const service = (currentResort.services || []).find((item) => item.id === form.elements.serviceId.value);
      if (!service) return fail('Choose a service that is currently listed.');
      const captchaToken = await window.UserBookingFeature?.getCaptchaToken('resort-booking-captcha') || '';
      if (window.UserBookingFeature?.captchaEnabled && !captchaToken) {
        return fail('Please complete the human verification.');
      }

      const booking = {
        targetType: 'resort',
        resortId: currentResort.id,
        serviceId: service.id,
        travelerName: form.elements.travelerName.value.trim(),
        contact: form.elements.contact.value.trim(),
        guests: Number(form.elements.guests.value),
        notes: form.elements.notes.value.trim(),
        ...(service.type === 'overnight'
          ? { checkIn: form.elements.checkIn.value, checkOut: form.elements.checkOut.value }
          : { date: form.elements.date.value })
      };
      button.disabled = true;
      try {
        const { data, error } = await supabaseClient.functions.invoke('secure-api', {
          body: {
            action: 'create-booking',
            booking,
            ...(window.UserBookingFeature?.captchaEnabled ? { captchaToken } : {}),
            termsAccepted: true
          }
        });
        if (error || !data?.ok) {
          const details = await error?.context?.json?.().catch(() => null);
          fail(details?.error || data?.error || 'We could not save your request. Please try again.');
          return;
        }
        success.hidden = false;
        form.reset();
        updateServiceDates();
      } catch (error) {
        console.error('Resort booking request failed.', error);
        fail('The booking service is unavailable. Please try again.');
      } finally {
        button.disabled = false;
        window.UserBookingFeature?.resetCaptcha('resort-booking-captcha');
      }
    });
  }

  window.UserResortsFeature = {
    render(state) {
      currentState = state;
      setupBookingForm();
      renderResorts(state);
      if (currentResort) {
        const resort = (state.resorts || []).find((item) => item.id === currentResort.id);
        if (resort) {
          currentResort = resort;
          showResortDetails(resort);
        } else {
          currentResort = null;
          const detail = document.getElementById('resort-detail');
          if (detail) detail.hidden = true;
        }
      }
    },
    select: selectResort
  };
})();
