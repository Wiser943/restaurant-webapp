// Logic for the single item detail page (item.html?id=...)

const params = new URLSearchParams(window.location.search);
const itemId = params.get('id');

let item = null;
let currentUser = null;
let isFavorite = false;
let quantity = 1;

// selectedExtras: { [extraName]: quantity }  — an extra only counts toward
// the total once its toggle is on (quantity >= 1).
let selectedExtras = {};

async function loadItem() {
  if (!itemId) { showError('No item specified.'); return; }

  try {
    const data = await api.get(`/menu/${itemId}`);
    item = data.item;
  } catch (e) {
    showError('This item could not be found.');
    return;
  }

  try {
    const me = await api.get('/auth/me');
    currentUser = me.user;
    isFavorite = (me.user.favorites || []).map(String).includes(itemId);
  } catch (e) { /* not logged in - fine, they can still view */ }

  renderItem();
}

function showError(message) {
  document.getElementById('item-sheet').innerHTML = `<p class="helper-text">${message}</p>`;
}

function extrasTotal() {
  return (item.extras || []).reduce((sum, ex) => {
    const qty = selectedExtras[ex.name] || 0;
    return sum + ex.price * qty;
  }, 0);
}

function renderExtras() {
  if (!item.extras || !item.extras.length) return '';
  return `
    <div class="ticket-tear"></div>
    <div class="extras-section">
      <p class="extras-title">Customize</p>
      <div id="extras-list">
        ${item.extras.map((ex) => {
          const qty = selectedExtras[ex.name] || 0;
          const on = qty > 0;
          return `
            <div class="extra-row" data-name="${escapeAttr(ex.name)}">
              <div class="extra-info">
                <span class="extra-name">${escapeHtml(ex.name)}</span>
                <span class="extra-price">+ ${currency(ex.price)} each</span>
              </div>
              <div class="extra-controls">
                ${on ? `
                  <div class="extra-stepper">
                    <button type="button" class="extra-minus" aria-label="Fewer ${escapeAttr(ex.name)}"><i class="fa-solid fa-minus"></i></button>
                    <span>${qty}</span>
                    <button type="button" class="extra-plus" aria-label="More ${escapeAttr(ex.name)}"><i class="fa-solid fa-plus"></i></button>
                  </div>` : ''}
                <label class="switch">
                  <input type="checkbox" class="extra-toggle" ${on ? 'checked' : ''} />
                  <span class="switch-track"></span>
                </label>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderItem() {
  const priceIncreased = item.previousPrice != null && item.currentPrice > item.previousPrice;

  document.getElementById('hero-wrap').innerHTML = item.images?.[0]
    ? `<img src="${item.images[0]}" alt="${item.name}">`
    : `<div class="hero-placeholder display">${item.name.charAt(0)}</div>`;

  document.getElementById('item-sheet').innerHTML = `
    <div class="tag-row">
      ${!item.isAvailable ? '<span class="tag tag-sold-out">Sold out</span>' : '<span class="tag tag-ready">Ready now</span>'}
      ${item.isAlwaysOnMenu ? '<span class="tag tag-staple">Always on the menu</span>' : ''}
    </div>
    <div class="title-row">
      <h1 class="display">${item.name}</h1>
      <div class="price-block">
        <span class="price">${currency(item.currentPrice)}</span>
        ${priceIncreased ? `<span class="price-old">${currency(item.previousPrice)}</span>` : ''}
      </div>
    </div>
    ${item.description ? `<p class="description">${item.description}</p>` : ''}
    <div class="ticket-tear"></div>
    <div class="qty-row">
      <span class="qty-label">Quantity</span>
      <div class="stepper">
        <button id="qty-minus" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button>
        <span id="qty-value">${quantity}</span>
        <button id="qty-plus" aria-label="Increase quantity"><i class="fa-solid fa-plus"></i></button>
      </div>
    </div>
    ${renderExtras()}
  `;

  document.getElementById('qty-minus').addEventListener('click', () => { quantity = Math.max(1, quantity - 1); updateQtyAndButton(); });
  document.getElementById('qty-plus').addEventListener('click', () => { quantity += 1; updateQtyAndButton(); });

  bindExtraControls();
  updateFavoriteIcon();
  updateAddButton();

  document.getElementById('fav-btn').addEventListener('click', toggleFavorite);
  document.getElementById('add-btn').addEventListener('click', handleAdd);
}

function bindExtraControls() {
  const list = document.getElementById('extras-list');
  if (!list) return;

  list.querySelectorAll('.extra-row').forEach((row) => {
    const name = row.dataset.name;
    const toggle = row.querySelector('.extra-toggle');

    toggle.addEventListener('change', () => {
      selectedExtras[name] = toggle.checked ? 1 : 0;
      if (!toggle.checked) delete selectedExtras[name];
      rerenderExtrasRow(name);
      updateAddButton();
    });

    row.querySelector('.extra-minus')?.addEventListener('click', () => {
      const qty = Math.max(1, (selectedExtras[name] || 1) - 1);
      selectedExtras[name] = qty;
      rerenderExtrasRow(name);
      updateAddButton();
    });
    row.querySelector('.extra-plus')?.addEventListener('click', () => {
      selectedExtras[name] = (selectedExtras[name] || 1) + 1;
      rerenderExtrasRow(name);
      updateAddButton();
    });
  });
}

function rerenderExtrasRow(name) {
  const list = document.getElementById('extras-list');
  const ex = item.extras.find((e) => e.name === name);
  const row = list.querySelector(`.extra-row[data-name="${cssEscape(name)}"]`);
  const qty = selectedExtras[name] || 0;
  const on = qty > 0;
  row.querySelector('.extra-controls').innerHTML = `
    ${on ? `
      <div class="extra-stepper">
        <button type="button" class="extra-minus" aria-label="Fewer ${escapeAttr(name)}"><i class="fa-solid fa-minus"></i></button>
        <span>${qty}</span>
        <button type="button" class="extra-plus" aria-label="More ${escapeAttr(name)}"><i class="fa-solid fa-plus"></i></button>
      </div>` : ''}
    <label class="switch">
      <input type="checkbox" class="extra-toggle" ${on ? 'checked' : ''} />
      <span class="switch-track"></span>
    </label>`;

  row.querySelector('.extra-toggle').addEventListener('change', (e) => {
    selectedExtras[name] = e.target.checked ? 1 : 0;
    if (!e.target.checked) delete selectedExtras[name];
    rerenderExtrasRow(name);
    updateAddButton();
  });
  row.querySelector('.extra-minus')?.addEventListener('click', () => {
    selectedExtras[name] = Math.max(1, (selectedExtras[name] || 1) - 1);
    rerenderExtrasRow(name);
    updateAddButton();
  });
  row.querySelector('.extra-plus')?.addEventListener('click', () => {
    selectedExtras[name] = (selectedExtras[name] || 1) + 1;
    rerenderExtrasRow(name);
    updateAddButton();
  });
}

function updateQtyAndButton() {
  document.getElementById('qty-value').textContent = quantity;
  updateAddButton();
}

function updateAddButton() {
  const btn = document.getElementById('add-btn');
  const total = item.currentPrice * quantity + extrasTotal();
  btn.disabled = !item.isAvailable;
  if (!item.isAvailable) btn.textContent = 'Currently unavailable';
  else if (!currentUser) btn.textContent = 'Log in to order';
  else btn.textContent = `Add to Cart · ${currency(total)}`;
}

function updateFavoriteIcon() {
  const icon = document.getElementById('fav-icon');
  icon.setAttribute('fill', isFavorite ? '#ff6a1a' : 'none');
  icon.querySelector('path').setAttribute('stroke', isFavorite ? '#ff6a1a' : '#f6efe4');
}

async function toggleFavorite() {
  if (!currentUser) { window.location.href = `login.html?next=item.html?id=${itemId}`; return; }
  if (isFavorite) { await api.del(`/cart/favorites/${itemId}`); isFavorite = false; }
  else { await api.post(`/cart/favorites/${itemId}`, {}); isFavorite = true; }
  updateFavoriteIcon();
}

async function handleAdd() {
  if (!currentUser) { window.location.href = `login.html?next=item.html?id=${itemId}`; return; }
  const btn = document.getElementById('add-btn');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const extras = Object.entries(selectedExtras)
      .filter(([, qty]) => qty > 0)
      .map(([name, qty]) => ({ name, quantity: qty }));
    await api.post('/cart', { menuItemId: itemId, quantity, extras });
    btn.innerHTML = 'Added to cart <i class="fa-solid fa-check"></i>';
    UI.toast('Added to your cart', { type: 'success' });
    setTimeout(updateAddButton, 1400);
  } catch (err) {
    UI.toast(err.message || 'Could not add this item.', { type: 'danger' });
  } finally {
    btn.disabled = !item.isAvailable;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }
function cssEscape(str) { return window.CSS && CSS.escape ? CSS.escape(str) : str.replace(/["\\]/g, '\\$&'); }

loadItem();
