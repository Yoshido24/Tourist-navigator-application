// Tourist Mini Shop display feature
(function () {
  function renderShopProducts(state) {
    const shop = document.getElementById('shop-products');
    if (!shop) return;

    const products = state.shopProducts || [];
    shop.innerHTML = products.length
      ? products.map((product) => `
        <article class="shop-card">
          ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />` : ''}
          <div class="shop-card-content">
            <h3>${escapeHtml(product.name)}</h3>
            <strong>${escapeHtml(product.price || '')}</strong>
            <p>${escapeHtml(product.description || '')}</p>
            <small>${escapeHtml(product.availability || '')}</small>
          </div>
        </article>
      `).join('')
      : '<p>No shop products have been published yet.</p>';

    shop.querySelectorAll('.shop-card > img').forEach((image) => {
      image.classList.add('clickable-image');
      image.title = 'Open full image';
      image.tabIndex = 0;
      const openImage = () => window.openImageLightbox?.(image.src, image.alt);
      image.addEventListener('click', openImage);
      image.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openImage();
        }
      });
    });
  }

  window.UserShopFeature = {
    render: renderShopProducts
  };
})();
