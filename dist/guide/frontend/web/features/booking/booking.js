// Tourist booking submission feature. Bookings go through the secure-api Edge Function,
// which checks reCAPTCHA and the agreement before saving.
(function () {
  let captchaWidgetId = null;
  let captchaScriptPromise = null;

  function loadCaptcha() {
    if (typeof RECAPTCHA_SITE_KEY === 'undefined' || RECAPTCHA_SITE_KEY.startsWith('REPLACE_')) {
      return Promise.resolve(null);
    }
    if (!captchaScriptPromise) {
      captchaScriptPromise = new Promise((resolve, reject) => {
        window.onRecaptchaLoaded = () => resolve(window.grecaptcha);
        const script = document.createElement('script');
        script.src = 'https://www.google.com/recaptcha/api.js?onload=onRecaptchaLoaded&render=explicit';
        script.async = true;
        script.onerror = reject;
        document.head.appendChild(script);
      });
    }
    return captchaScriptPromise;
  }

  async function renderCaptcha() {
    const container = document.getElementById('booking-captcha');
    if (!container || captchaWidgetId !== null) return;
    if (typeof RECAPTCHA_SITE_KEY === 'undefined' || RECAPTCHA_SITE_KEY.startsWith('REPLACE_')) {
      container.textContent = 'Human verification is not configured yet. Set RECAPTCHA_SITE_KEY in supabase.public.js.';
      return;
    }
    try {
      const grecaptcha = await loadCaptcha();
      if (grecaptcha) captchaWidgetId = grecaptcha.render(container, { sitekey: RECAPTCHA_SITE_KEY });
    } catch (error) {
      console.warn('Unable to load human verification.', error);
    }
  }

  function setupBookingFeature(state) {
    const form = document.getElementById('booking-form');
    if (!form || form.dataset.featureBound === 'true') return;

    form.dataset.featureBound = 'true';
    renderCaptcha();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!(appState?.attractions || []).length) return;

      const success = document.getElementById('booking-success');
      const errorBox = document.getElementById('booking-error');
      const submitButton = form.querySelector('[type="submit"]');
      const fail = (text) => {
        if (errorBox) {
          errorBox.textContent = text;
          errorBox.hidden = false;
        }
        if (success) success.hidden = true;
      };
      if (errorBox) errorBox.hidden = true;

      if (!form.elements.terms?.checked) {
        fail('Please accept the Terms of Use and Privacy Notice.');
        return;
      }
      const captchaToken = captchaWidgetId !== null ? window.grecaptcha.getResponse(captchaWidgetId) : '';
      if (!captchaToken) {
        fail('Please complete the human verification.');
        return;
      }

      const booking = createBookingFromForm(form);
      const selectedAttraction = appState.attractions.find((item) => item.id === booking.attractionId);
      submitButton.disabled = true;
      const { data, error } = await supabaseClient.functions.invoke('secure-api', {
        body: { action: 'create-booking', booking, captchaToken, termsAccepted: true }
      });
      submitButton.disabled = false;
      if (captchaWidgetId !== null) window.grecaptcha.reset(captchaWidgetId);

      if (error || !data?.ok) {
        const details = await error?.context?.json?.().catch(() => null);
        fail(details?.error || data?.error || 'We could not save your booking. Please try again.');
        return;
      }

      if (success) success.hidden = false;
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
