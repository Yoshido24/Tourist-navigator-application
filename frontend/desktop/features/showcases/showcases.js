(function () {
  let pickerMap = null;
  let draftMarker = null;
  let draftPosition = null;

  const input = (id) => document.getElementById(id);

  function setMessage(text, isError = false) {
    const message = input('showcase-message');
    message.textContent = text;
    message.classList?.toggle('error-message', isError);
    message.hidden = false;
  }

  function currentShowcases() {
    return typeof appState !== 'undefined' ? appState.showcases || [] : [];
  }

  function updateShowcases(items) {
    if (typeof appState !== 'undefined') appState.showcases = items;
    render(items);
  }

  function setPinPosition(latitude, longitude) {
    input('showcase-latitude').value = latitude.toFixed(6);
    input('showcase-longitude').value = longitude.toFixed(6);
    input('showcase-position').textContent = `Lat ${latitude.toFixed(4)}, Lng ${longitude.toFixed(4)}`;
  }

  function resetForm() {
    input('showcase-form').reset();
    input('showcase-id').value = '';
    input('showcase-latitude').value = '';
    input('showcase-longitude').value = '';
    input('showcase-position').textContent = 'Choose a map pin or enter coordinates below.';
    input('showcase-submit').textContent = 'Save showcase';
    input('showcase-message').hidden = true;
    input('showcase-message').textContent = '';
  }

  function closePicker() {
    input('showcase-pin-modal').hidden = true;
    if (draftMarker) pickerMap.removeLayer(draftMarker);
    draftMarker = null;
    draftPosition = null;
  }

  function render(items = []) {
    const list = input('showcases-list');
    if (!list) return;
    const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));
    list.innerHTML = sortedItems.map((item) => `
      <article class="dashboard-card">
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description)}</p>
        <p><strong>Pin:</strong> ${Number(item.latitude).toFixed(5)}, ${Number(item.longitude).toFixed(5)}</p>
        <div class="attraction-management-actions">
          <button class="btn btn-secondary" type="button" data-edit-showcase="${escapeHtml(item.id)}">Edit</button>
          <button class="btn btn-secondary" type="button" data-delete-showcase="${escapeHtml(item.id)}">Delete</button>
        </div>
      </article>`).join('') || '<p class="empty-state">No Showcase places yet.</p>';

    list.querySelectorAll('[data-edit-showcase]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = sortedItems.find((showcase) => showcase.id === button.dataset.editShowcase);
        if (!item) return;
        input('showcase-id').value = item.id;
        input('showcase-name').value = item.name;
        input('showcase-description').value = item.description;
        setPinPosition(Number(item.latitude), Number(item.longitude));
        input('showcase-submit').textContent = 'Save showcase';
        input('showcase-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    list.querySelectorAll('[data-delete-showcase]').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = sortedItems.find((showcase) => showcase.id === button.dataset.deleteShowcase);
        if (!item || !window.confirm(`Delete "${item.name}" from Showcase?`)) return;
        button.disabled = true;
        try {
          const { data, error } = await supabaseClient.from('showcases')
            .delete().eq('id', item.id).select('id').maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Showcase place was not deleted. Refresh and try again.');
          updateShowcases(currentShowcases().filter((showcase) => showcase.id !== item.id));
          if (input('showcase-id').value === item.id) resetForm();
          setMessage('Showcase place deleted.');
        } catch (error) {
          setMessage(error.message, true);
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function openPicker() {
    if (typeof window.L === 'undefined') {
      setMessage('The map picker is unavailable. Reload the page and try again.', true);
      return;
    }

    input('showcase-pin-modal').hidden = false;
    if (!pickerMap) {
      pickerMap = window.L.map('showcase-map', { zoomControl: true, scrollWheelZoom: true })
        .setView([14.73, 121.15], 13);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(pickerMap);
      pickerMap.on('click', (event) => {
        draftPosition = [event.latlng.lat, event.latlng.lng];
        if (draftMarker) pickerMap.removeLayer(draftMarker);
        draftMarker = window.L.marker(draftPosition).addTo(pickerMap);
        input('showcase-pin-confirm').disabled = false;
        input('showcase-pin-status').textContent = `Selected location: ${draftPosition[0].toFixed(5)}, ${draftPosition[1].toFixed(5)}`;
      });
    }

    const latitude = Number(input('showcase-latitude').value);
    const longitude = Number(input('showcase-longitude').value);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)
        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
        && input('showcase-latitude').value && input('showcase-longitude').value) {
      draftPosition = [latitude, longitude];
      if (draftMarker) pickerMap.removeLayer(draftMarker);
      draftMarker = window.L.marker(draftPosition).addTo(pickerMap);
      pickerMap.setView(draftPosition, 13);
      input('showcase-pin-confirm').disabled = false;
      input('showcase-pin-status').textContent = `Selected location: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    } else {
      draftPosition = null;
      input('showcase-pin-confirm').disabled = true;
      input('showcase-pin-status').textContent = 'No location selected yet.';
    }
    window.setTimeout(() => pickerMap.invalidateSize(), 0);
  }

  async function save(event) {
    event.preventDefault();
    const form = input('showcase-form');
    if (form.dataset.saving === 'true') return;

    const id = input('showcase-id').value;
    const existing = currentShowcases().find((item) => item.id === id);
    const name = input('showcase-name').value.trim();
    const description = input('showcase-description').value.trim();
    const latitude = Number(input('showcase-latitude').value);
    const longitude = Number(input('showcase-longitude').value);
    if (!name || name.length > 120 || !description || description.length > 2000) {
      setMessage('Enter a name and description within the displayed limits.', true);
      return;
    }
    if (!input('showcase-latitude').value || !input('showcase-longitude').value
        || !Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      setMessage('Choose a valid map pin before saving.', true);
      return;
    }
    if (!supabaseClient) {
      setMessage('Showcase places need a Supabase connection to save.', true);
      return;
    }

    form.dataset.saving = 'true';
    const submit = event.submitter || input('showcase-submit');
    submit.disabled = true;
    try {
      const showcase = {
        id: existing?.id || `showcase-${crypto.randomUUID()}`,
        name,
        description,
        latitude,
        longitude
      };
      const result = existing
        ? await supabaseClient.from('showcases').update(showcase)
          .eq('id', existing.id).select('id').maybeSingle()
        : await supabaseClient.from('showcases').insert(showcase);
      if (result.error) throw result.error;
      if (existing && !result.data) throw new Error('Showcase place was not updated. Refresh and try again.');

      updateShowcases(existing
        ? currentShowcases().map((item) => item.id === existing.id ? showcase : item)
        : [showcase, ...currentShowcases()]);
      resetForm();
      setMessage(existing ? 'Showcase place updated.' : 'Showcase place saved.');
    } catch (error) {
      setMessage(error.message, true);
    } finally {
      delete form.dataset.saving;
      submit.disabled = false;
    }
  }

  function setup() {
    input('showcase-form')?.addEventListener('submit', save);
    input('showcase-pin-button')?.addEventListener('click', openPicker);
    input('showcase-cancel')?.addEventListener('click', resetForm);
    input('showcase-pin-confirm')?.addEventListener('click', () => {
      if (!draftPosition) return;
      setPinPosition(draftPosition[0], draftPosition[1]);
      closePicker();
    });
    input('showcase-pin-modal')?.addEventListener('click', (event) => {
      if (event.target.id === 'showcase-pin-modal') closePicker();
    });
    document.querySelector('[data-close-showcase-pin]')?.addEventListener('click', closePicker);
  }

  window.AdminShowcaseFeature = { render, setup };
})();
