// Admin Mini Shop feature
(function () {
  function renderAdminShopProducts(state) {
    const list = document.getElementById('admin-shop-products-list');
    if (!list) return;

    const products = state.shopProducts || [];
    list.innerHTML = products.length ? '' : '<p class="empty-state">No shop products yet.</p>';

    products.forEach((product) => {
      const card = document.createElement('article');
      card.className = 'dashboard-card';
      card.innerHTML = `
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="" class="shop-product-image">` : ''}
        <h3>${escapeHtml(product.name)}</h3>
        <p><strong>Price:</strong> ${escapeHtml(product.price)}</p>
        <p>${escapeHtml(product.description)}</p>
        <p><strong>Where to buy:</strong> ${escapeHtml(product.availability)}</p>
        <button class="btn btn-secondary" type="button" data-shop-delete>Delete</button>
      `;
      card.querySelector('[data-shop-delete]').addEventListener('click', async () => {
        await updateState((currentState) => ({
          ...currentState,
          shopProducts: (currentState.shopProducts || []).filter((item) => item.id !== product.id)
        }));
      });
      list.appendChild(card);
    });
  }

  function setupAdminShopFeature() {
    const form = document.getElementById('add-shop-product-form');
    if (!form || form.dataset.featureBound === 'true') return;

    form.dataset.featureBound = 'true';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      await updateState((currentState) => ({
        ...currentState,
        shopProducts: [{
          id: `shop-${Date.now()}`,
          name: data.get('name') || '',
          price: data.get('price') || '',
          description: data.get('description') || '',
          availability: data.get('availability') || '',
          image: data.get('image') || ''
        }, ...(currentState.shopProducts || [])]
      }));
      form.reset();
    });
  }

  window.AdminShopFeature = {
    render: renderAdminShopProducts,
    setup: setupAdminShopFeature
  };
})();
