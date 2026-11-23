(function () {
  if (!['admin-desktop-only', 'barangay-admin-portal', 'resort-manager-portal']
    .some((name) => document.body.classList.contains(name))) return;
  const nav = document.querySelector('.topbar > .nav-links');
  if (!nav) return;

  let dashboardVisible = false;
  window.setDashboardNavigation = (visible) => {
    dashboardVisible = visible;
    document.body.classList.toggle('navigation-enhanced', visible);
  };
  if (document.body.classList.contains('barangay-admin-portal')) {
    const tabs = Array.from(document.querySelectorAll('[data-barangay-tab]'));
    const panels = Array.from(document.querySelectorAll('[data-barangay-tab-panel]'));
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((item) => {
          const active = item === tab;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-selected', String(active));
        });
        panels.forEach((panel) => {
          panel.hidden = panel.dataset.barangayTabPanel !== tab.dataset.barangayTab;
        });
      });
    });
    document.querySelectorAll('[data-barangay-tab-target]').forEach((button) => {
      button.addEventListener('click', () => {
        tabs.find((tab) => tab.dataset.barangayTab === button.dataset.barangayTabTarget)?.click();
      });
    });
  }
  if (!document.body.classList.contains('resort-manager-portal')) return;

  const mobile = window.matchMedia('(max-width: 1023px)');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'sidebar-toggle';
  toggle.textContent = '☰ Menu';
  nav.id = nav.id || 'site-navigation';
  toggle.setAttribute('aria-controls', nav.id);
  nav.parentElement.insertBefore(toggle, nav);

  function setOpen(open) {
    nav.classList.toggle('sidebar-open', open);
    nav.inert = dashboardVisible && mobile.matches && !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
  }

  window.setDashboardNavigation = (visible) => {
    dashboardVisible = visible;
    document.body.classList.toggle('navigation-enhanced', visible);
    setOpen(false);
  };
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (event) => {
    if (mobile.matches && event.target.closest('a, [role="tab"]')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobile.matches && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  mobile.addEventListener('change', () => setOpen(false));
  setOpen(false);
})();
