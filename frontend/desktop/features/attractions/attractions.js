// Admin attraction list actions
(function () {
  function setupAdminAttractionActions() {
    document.querySelectorAll('[data-attraction-edit]').forEach((button) => {
      if (button.dataset.featureBound === 'true') return;
      button.dataset.featureBound = 'true';
    });
  }

  window.AdminAttractionsFeature = {
    setup: setupAdminAttractionActions
  };
})();
