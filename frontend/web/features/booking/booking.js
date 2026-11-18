// Tourist booking submission feature. Bookings go through the secure-api Edge Function,
// which checks reCAPTCHA and the agreement before saving.
(function () {
  const captchaEnabled = typeof RECAPTCHA_ENABLED !== 'undefined' && RECAPTCHA_ENABLED;
  const captchaWidgetIds = new Map();
  let captchaScriptPromise = null;

  function loadCaptcha() {
    if (!captchaEnabled || typeof RECAPTCHA_SITE_KEY === 'undefined' || RECAPTCHA_SITE_KEY.startsWith('REPLACE_')) {
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

  async function renderCaptcha(containerId) {
    const container = document.getElementById(containerId);
    if (!container || captchaWidgetIds.has(containerId)) return;
    if (!captchaEnabled) return;
    if (typeof RECAPTCHA_SITE_KEY === 'undefined' || RECAPTCHA_SITE_KEY.startsWith('REPLACE_')) {
      container.textContent = 'Human verification is not configured yet. Set RECAPTCHA_SITE_KEY in supabase.public.js.';
      return;
    }
    try {
      const grecaptcha = await loadCaptcha();
      if (grecaptcha) captchaWidgetIds.set(containerId, grecaptcha.render(container, { sitekey: RECAPTCHA_SITE_KEY }));
    } catch (error) {
      console.warn('Unable to load human verification.', error);
    }
  }

  async function getCaptchaToken(containerId) {
    await renderCaptcha(containerId);
    const widgetId = captchaWidgetIds.get(containerId);
    return captchaEnabled && widgetId !== undefined ? window.grecaptcha.getResponse(widgetId) : '';
  }

  function resetCaptcha(containerId) {
    const widgetId = captchaWidgetIds.get(containerId);
    if (widgetId !== undefined) window.grecaptcha.reset(widgetId);
  }

  function setupBookingFeature(state) {
    const form = document.getElementById('booking-form');
    if (!form || form.dataset.featureBound === 'true') return;

    form.dataset.featureBound = 'true';
    renderCaptcha('booking-captcha');

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
      const booking = createBookingFromForm(form);
      const selectedAttraction = appState.attractions.find((item) => item.id === booking.attractionId);
      if (!selectedAttraction?.barangay_id) {
        fail('Bookings are paused until this attraction has an assigned barangay.');
        return;
      }
      const captchaToken = await getCaptchaToken('booking-captcha');
      if (captchaEnabled && !captchaToken) {
        fail('Please complete the human verification.');
        return;
      }

      submitButton.disabled = true;
      const { data, error } = await supabaseClient.functions.invoke('secure-api', {
        body: {
          action: 'create-booking',
          booking,
          ...(captchaEnabled ? { captchaToken } : {}),
          termsAccepted: true
        }
      });
      submitButton.disabled = false;
      resetCaptcha('booking-captcha');

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
    setup: setupBookingFeature,
    renderCaptcha,
    getCaptchaToken,
    resetCaptcha,
    captchaEnabled
  };
})();
