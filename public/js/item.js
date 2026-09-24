// Logic for the single item detail page (item.html?id=...)

const params = new URLSearchParams(window.location.search);
const itemId = params.get('id');

let item = null;
let currentUser = null;
let isFavorite = false;
let quantity = 1;
let reviews = [];
let ratingAvg = 0;
let ratingCount = 0;
let canReview = false;
let reviewableOrderId = null;
let draftStars = 0;

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

  try {
    const data = await api.get(`/reviews/menu/${itemId}`);
    reviews = data.reviews;
    ratingAvg = data.ratingAvg;
    ratingCount = data.ratingCount;
  } catch (e) { reviews = []; }

  if (currentUser) {
    try {
      const data = await api.get(`/reviews/can-review/${itemId}`);
      canReview = data.canReview;
      reviewableOrderId = data.orderId;
    } catch (e) { canReview = false; }
  }

  renderReviews();
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

function renderHero() {
  const wrap = document.getElementById('hero-wrap');
  const images = (item.images || []).filter(Boolean);

  if (!images.length) {
    wrap.innerHTML = `<div class="hero-placeholder display">${escapeHtml(item.name.charAt(0))}</div>`;
    return;
  }

  if (images.length === 1) {
    wrap.innerHTML = `<img src="${images[0]}" alt="${escapeHtml(item.name)}">`;
    return;
  }

  wrap.innerHTML = `
    <div class="hero-carousel-track" id="hero-track">
      ${images.map((src) => `<div class="hero-carousel-slide"><img src="${src}" alt="${escapeHtml(item.name)}"></div>`).join('')}
    </div>
    <div class="hero-carousel-dots" id="hero-dots">
      ${images.map((_, i) => `<span class="hero-carousel-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}
    </div>
  `;

  const track = document.getElementById('hero-track');
  track.addEventListener('scroll', () => {
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    document.querySelectorAll('#hero-dots .hero-carousel-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDescriptionHtml(text) {
  // Preserve real paragraph breaks (blank line = new <p>) and single line
  // breaks (<br>) instead of letting the browser collapse everything from
  // the admin's textarea into one dense wall of text.
  return text
    .split(/\n\s*\n/)
    .map((para) => escapeHtml(para.trim()).replace(/\n/g, '<br>'))
    .filter(Boolean)
    .map((para) => `<p>${para}</p>`)
    .join('');
}

const DESCRIPTION_WORD_LIMIT = 80;

// Splits on whitespace to get a real word count, rather than the previous
// character-length check — 220 characters cuts some descriptions off far
// earlier than others depending on word length.
function descriptionWords(text) {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

function renderDescription(text) {
  const words = descriptionWords(text);
  const isLong = words.length > DESCRIPTION_WORD_LIMIT;
  if (!isLong) {
    return `<div class="description">${formatDescriptionHtml(text)}</div>`;
  }
  const shortText = words.slice(0, DESCRIPTION_WORD_LIMIT).join(' ') + '…';
  return `
    <div class="description" id="item-description">${escapeHtml(shortText)}</div>
    <button type="button" class="description-toggle" id="description-toggle-btn" data-expanded="false">Read more <i class="fa-solid fa-chevron-down"></i></button>
  `;
}

function bindDescriptionToggle() {
  const btn = document.getElementById('description-toggle-btn');
  if (!btn) return;
  const words = descriptionWords(item.description);
  const shortText = words.slice(0, DESCRIPTION_WORD_LIMIT).join(' ') + '…';
  btn.addEventListener('click', () => {
    const desc = document.getElementById('item-description');
    const expanded = btn.dataset.expanded === 'true';
    if (expanded) {
      // Read less: collapse back to the ~80-word preview.
      desc.textContent = shortText;
      btn.innerHTML = 'Read more <i class="fa-solid fa-chevron-down"></i>';
      btn.dataset.expanded = 'false';
    } else {
      // Read more: show the full description, paragraphs and all.
      desc.innerHTML = formatDescriptionHtml(item.description);
      btn.innerHTML = 'Read less <i class="fa-solid fa-chevron-up"></i>';
      btn.dataset.expanded = 'true';
    }
  });
}

function renderItem() {
  const priceIncreased = item.previousPrice != null && item.currentPrice > item.previousPrice;

  renderHero();

  document.getElementById('item-sheet').innerHTML = `
    <div class="tag-row">
      ${!item.isAvailable ? '<span class="tag tag-sold-out">Sold out</span>' : '<span class="tag tag-ready">Ready now</span>'}
      ${item.isAlwaysOnMenu ? '<span class="tag tag-staple">Always on the menu</span>' : ''}
      ${item.ratingCount ? `<span class="star-rating"><span class="stars">${starsHtml(item.ratingAvg)}</span><span class="rating-count">${item.ratingAvg.toFixed(1)} (${item.ratingCount})</span></span>` : ''}
    </div>
    <div class="title-row">
      <h1 class="display">${item.name}</h1>
      <div class="price-block">
        <span class="price">${currency(item.currentPrice)}</span>
        ${priceIncreased ? `<span class="price-old">${currency(item.previousPrice)}</span>` : ''}
      </div>
    </div>
    ${item.description ? renderDescription(item.description) : ''}
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
  bindDescriptionToggle();
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

function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }
function cssEscape(str) { return window.CSS && CSS.escape ? CSS.escape(str) : str.replace(/["\\]/g, '\\$&'); }

// ---- Ratings & reviews ----

function starsHtml(rating) {
  const rounded = Math.round(rating);
  return Array.from({ length: 5 }).map((_, i) =>
    `<i class="fa-solid fa-star ${i < rounded ? '' : 'star-empty'}"></i>`
  ).join('');
}

function formatReviewDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function renderReviews() {
  const wrap = document.getElementById('reviews-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="reviews-section">
      <p class="eyebrow" style="margin-bottom:10px;">Reviews</p>

      ${canReview ? `
        <div class="card review-form-card">
          <p class="extras-title" style="margin-bottom:8px;">How was it?</p>
          <div class="star-input" id="star-input">
            ${Array.from({ length: 5 }).map((_, i) => `<i class="fa-solid fa-star" data-value="${i + 1}"></i>`).join('')}
          </div>
          <textarea id="review-comment" rows="2" placeholder="Optional — tell us more"></textarea>
          <button class="btn btn-primary btn-sm" id="submit-review-btn" style="margin-top:10px;" disabled>Submit review</button>
          <p class="error-text" id="review-error" style="display:none; margin-top:8px;"></p>
        </div>
      ` : ''}

      ${reviews.length ? `
        <div class="reviews-summary">
          <span class="avg-number">${ratingAvg.toFixed(1)}</span>
          <div>
            <div class="stars">${starsHtml(ratingAvg)}</div>
            <span class="rating-count">${ratingCount} review${ratingCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div id="review-list">
          ${reviews.map((r) => `
            <div class="review-row">
              <div class="review-row-head">
                <span class="review-author">${escapeHtml(r.userName)}</span>
                <span class="stars">${starsHtml(r.rating)}</span>
              </div>
              <span class="review-date">${formatReviewDate(r.createdAt)}</span>
              ${r.comment ? `<p class="review-comment">${escapeHtml(r.comment)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      ` : `<p class="helper-text">No reviews yet — be the first to try this and let others know what you think.</p>`}
    </div>
  `;

  if (canReview) bindStarInput();
}

function bindStarInput() {
  const starInput = document.getElementById('star-input');
  const submitBtn = document.getElementById('submit-review-btn');
  const stars = starInput.querySelectorAll('i');

  function paintStars(n) {
    stars.forEach((s, i) => s.classList.toggle('filled', i < n));
  }

  stars.forEach((star) => {
    star.addEventListener('click', () => {
      draftStars = Number(star.dataset.value);
      paintStars(draftStars);
      submitBtn.disabled = false;
    });
  });

  submitBtn.addEventListener('click', submitReview);
}

async function submitReview() {
  const btn = document.getElementById('submit-review-btn');
  const errorEl = document.getElementById('review-error');
  errorEl.style.display = 'none';

  if (!draftStars) return;

  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    await api.post('/reviews', {
      menuItemId: itemId,
      orderId: reviewableOrderId,
      rating: draftStars,
      comment: document.getElementById('review-comment').value,
    });
    UI.toast('Thanks for the review!', { type: 'success' });
    draftStars = 0;
    canReview = false;

    const data = await api.get(`/reviews/menu/${itemId}`);
    reviews = data.reviews;
    ratingAvg = data.ratingAvg;
    ratingCount = data.ratingCount;
    item.ratingAvg = data.ratingAvg;
    item.ratingCount = data.ratingCount;

    renderReviews();
    renderItem();
  } catch (err) {
    errorEl.textContent = err.message || 'Could not submit your review.';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit review';
  }
}

loadItem();
