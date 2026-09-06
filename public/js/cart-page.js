// Logic for the cart page

let cart = { items: [] };

async function loadCart() {
  try {
    const me = await api.get('/auth/me');
  } catch (e) {
    window.location.href = 'login.html?next=cart.html';
    return;
  }

  try {
    const data = await api.get('/cart');
    cart = data.cart;
  } catch (e) {
    cart = { items: [] };
  }
  renderCart();
}

function lineTotal(line) {
  const base = (line.menuItem?.currentPrice ?? line.priceAtAdd) * line.quantity;
  const extras = (line.extras || []).reduce((s, e) => s + e.price * e.quantity, 0);
  return base + extras;
}

function renderCart() {
  const container = document.getElementById('cart-content');

  if (!cart.items?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Your cart</p>
        <h2 class="display">It's empty right now</h2>
        <p class="helper-text">Add something from the menu to get started.</p>
        <a href="index.html" class="btn btn-primary" style="margin-top:16px;">Browse the menu</a>
      </div>`;
    return;
  }

  const total = cart.items.reduce((sum, line) => sum + lineTotal(line), 0);

  container.innerHTML = `
    <div class="cart-list">
      ${cart.items.map((line) => {
        const item = line.menuItem;
        if (!item) return '';
        const thumb = item.images?.[0];
        return `
          <div class="card cart-card" data-line="${line.lineId}">
            <div class="cart-card-top">
              ${thumb
                ? `<img class="cart-card-thumb" src="${thumb}" alt="${escapeHtml(item.name)}" onerror="this.style.visibility='hidden'" />`
                : `<div class="cart-card-thumb-placeholder">${escapeHtml(item.name.charAt(0))}</div>`}
              <div class="cart-card-info">
                <h3>${escapeHtml(item.name)}</h3>
                <span class="cart-card-unit-price">${currency(item.currentPrice)} each</span>
                ${!item.isAvailable ? '<div style="margin-top:6px;"><span class="badge badge-sold-out">No longer available</span></div>' : ''}
                ${line.extras?.length ? `
                  <div class="cart-extras">
                    ${line.extras.map((ex) => `<span class="cart-extra-chip">+ ${ex.quantity} × ${escapeHtml(ex.name)}</span>`).join('')}
                  </div>` : ''}
              </div>
            </div>
            <div class="cart-card-footer">
              <div class="qty-control">
                <button class="qty-minus" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button>
                <span>${line.quantity}</span>
                <button class="qty-plus" aria-label="Increase quantity"><i class="fa-solid fa-plus"></i></button>
              </div>
              <span class="cart-card-line-total">${currency(lineTotal(line))}</span>
            </div>
          </div>`;
      }).join('')}
    </div>
    <div class="ticket-tear"></div>
    <div class="cart-total" style="margin-bottom:16px;">
      <span>Total</span>
      <span class="price">${currency(total)}</span>
    </div>
    <a href="checkout.html" class="btn btn-primary btn-block">Proceed to checkout</a>
  `;

  container.querySelectorAll('.cart-card').forEach((row) => {
    const lineId = row.dataset.line;
    const line = cart.items.find((l) => l.lineId === lineId);
    row.querySelector('.qty-minus').addEventListener('click', () => changeQty(lineId, Math.max(0, line.quantity - 1)));
    row.querySelector('.qty-plus').addEventListener('click', () => changeQty(lineId, line.quantity + 1));
    row.querySelector('.remove-btn').addEventListener('click', () => removeItem(lineId));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function changeQty(lineId, newQty) {
  if (newQty <= 0) { await removeItem(lineId); return; }
  const data = await api.put(`/cart/${lineId}`, { quantity: newQty });
  cart = data.cart;
  renderCart();
  renderNav();
}

async function removeItem(lineId) {
  const confirmed = await UI.confirm('Remove this item from your cart?', { title: 'Remove item', confirmText: 'Remove', danger: true });
  if (!confirmed) return;
  const data = await api.del(`/cart/${lineId}`);
  cart = data.cart;
  renderCart();
  renderNav();
}

loadCart();
