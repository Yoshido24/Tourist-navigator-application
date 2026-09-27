// Admin public transport editor: repeatable rows for an attraction's transport options
(function () {
  function addTransportOptionRow(container, option = {}) {
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'transport-editor-row';
    row.innerHTML = `
      <select data-transport-mode aria-label="Transport type">
        <option value="">Transport type</option>
        <option value="Jeepney">Jeepney</option>
        <option value="Tricycle">Tricycle</option>
        <option value="Bus">Bus</option>
        <option value="UV Express">UV Express</option>
        <option value="Taxi">Taxi</option>
        <option value="Walking">Walking</option>
        <option value="Private vehicle">Private vehicle</option>
        <option value="Other">Other</option>
      </select>
      <input data-transport-fare placeholder="Fare per person" aria-label="Fare per person" />
      <input data-transport-time placeholder="Estimated time" aria-label="Estimated time" />
      <input data-transport-route placeholder="Route or details" aria-label="Route or details" />
      <button class="btn btn-secondary" type="button" data-remove-transport>Remove</button>
    `;
    row.querySelector('[data-transport-mode]').value = option.mode || '';
    row.querySelector('[data-transport-fare]').value = option.fare || '';
    row.querySelector('[data-transport-time]').value = option.time || '';
    row.querySelector('[data-transport-route]').value = option.route || '';
    row.querySelector('[data-remove-transport]').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  function readTransportOptions(container) {
    const options = [...(container?.querySelectorAll('.transport-editor-row') || [])]
      .map((row) => ({
        mode: row.querySelector('[data-transport-mode]')?.value.trim() || '',
        fare: row.querySelector('[data-transport-fare]')?.value.trim() || '',
        time: row.querySelector('[data-transport-time]')?.value.trim() || '',
        route: row.querySelector('[data-transport-route]')?.value.trim() || ''
      }))
      .filter((option) => option.mode);
    return options.filter((option, index) => (
      options.findIndex((item) => (
        item.mode === option.mode &&
        item.fare === option.fare &&
        item.time === option.time &&
        item.route === option.route
      )) === index
    ));
  }

  function loadTransportOptions(container, savedTransport) {
    if (!container) return;
    container.innerHTML = '';
    const transportRows = Array.isArray(savedTransport)
      ? savedTransport
      : (() => {
        try { return JSON.parse(savedTransport); } catch { return []; }
      })();
    const uniqueRows = transportRows.filter((option, index) => (
      transportRows.findIndex((item) => (
        item.mode === option.mode &&
        item.fare === option.fare &&
        item.time === option.time &&
        item.route === option.route
      )) === index
    ));
    uniqueRows.forEach((option) => addTransportOptionRow(container, option));
  }

  window.AdminTransportFeature = {
    addRow: addTransportOptionRow,
    readOptions: readTransportOptions,
    loadOptions: loadTransportOptions
  };
})();
