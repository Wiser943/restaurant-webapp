// Logic for the home page: load the menu + banners, handle search,
// category filtering, favorites, add-to-cart, and live updates.

const CATEGORY_ICONS = {
  all: 'fa-fire', burger: 'fa-burger', pizza: 'fa-pizza-slice', chicken: 'fa-drumstick-bite',
  fries: 'fa-utensils', drink: 'fa-mug-saucer', drinks: 'fa-mug-saucer', rice: 'fa-bowl-rice',
  soup: 'fa-bowl-food', grill: 'fa-fire-burner', dessert: 'fa-ice-cream', default: 'fa-utensils',
};
function iconFor(category) {
  const cls = CATEGORY_ICONS[category.toLowerCase()] || CATEGORY_ICONS.default;
  return `<i class="fa-solid ${cls}"></i>`;
}

let allItems = [];
let banners = [];
let favorites = [];
let activeCategory = 'All';
let currentUser = null;

// Filter/sort state, applied on top of the search + category filters already
// in renderGrid(). Persists for the session (not saved between visits).
let filters = {
  minPrice: null,
  maxPrice: null,
  availableOnly: false,
  sort: 'default', // 'default' | 'price-asc' | 'price-desc' | 'rating'
};

function renderSkeletonGrid(count = 6) {
  const grid = document.getElementById('menu-grid');
  grid.innerHTML = Array.from({ length: count }).map(() => `
    <div class="card skeleton-card">
      <div class="skeleton skeleton-thumb"></div>
      <div class="skeleton skeleton-line w-70"></div>
      <div class="skeleton skeleton-line w-40"></div>
    </div>
  `).join('');
}

async function loadHome() {
  renderSkeletonGrid();
  try {
    const [menuData, bannerData] = await Promise.all([api.get('/menu'), api.get('/banners')]);
    allItems = menuData.items;
    banners = bannerData.banners;
  } catch (e) {
    document.getElementById('menu-grid').innerHTML = `<p class="helper-text">Could not load the menu right now.</p>`;
    return;
  }

  try {
    const me = await api.get('/auth/me');
    currentUser = me.user;
    favorites = (me.user.favorites || []).map(String);
    document.getElementById('hello-text').innerHTML = `Hi, ${me.user.name.split(' ')[0]} <i class="fa-solid fa-hand-peace" style="color:var(--orange);"></i>`;
    document.getElementById('avatar-link').textContent = me.user.name.charAt(0).toUpperCase();
    document.getElementById('avatar-link').href = 'account.html';
  } catch (e) {
    document.getElementById('avatar-link').href = 'login.html';
  }

  renderCategories();
  renderBanners();
  renderGrid();
  if (typeof SpecialModal !== 'undefined') SpecialModal.maybeShow(allItems);
}

function renderCategories() {
  const cats = ['All', ...new Set(allItems.map((i) => i.category))];
  const row = document.getElementById('category-row');
  row.innerHTML = cats.map((c) => `
    <button class="cat-pill ${activeCategory === c ? 'active' : ''}" data-cat="${c}">
      <span class="cat-icon">${c === 'All' ? `<i class="fa-solid ${CATEGORY_ICONS.all}"></i>` : iconFor(c)}</span>
      <span>${c}</span>
    </button>
  `).join('');
  row.querySelectorAll('.cat-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat;
      renderCategories();
      renderGrid();
    });
  });
}

function renderBanners() {
  const strip = document.getElementById('banner-strip');
  if (!banners.length) { strip.innerHTML = ''; return; }
  strip.innerHTML = banners.map((b) => `
    <a href="${b.linkTo || '#'}" class="banner glass-strong rise-in">
      <div class="banner-copy">
        <span class="banner-tag"><i class="fa-solid fa-fire"></i> Limited Time Offer</span>
        <h3 class="display banner-title">${escapeHtml(b.title)}</h3>
        <span class="banner-cta">Order Now</span>
      </div>
      <img src="${b.imageUrl}" class="banner-img" alt="" />
    </a>
  `).join('');
}

function renderGrid() {
  const search = document.getElementById('search-input').value.toLowerCase();
  let visible = allItems
    .filter((i) => activeCategory === 'All' || i.category === activeCategory)
    .filter((i) => i.name.toLowerCase().includes(search))
    .filter((i) => filters.minPrice == null || i.currentPrice >= filters.minPrice)
    .filter((i) => filters.maxPrice == null || i.currentPrice <= filters.maxPrice)
    .filter((i) => !filters.availableOnly || i.isAvailable);

  if (filters.sort === 'price-asc') visible = [...visible].sort((a, b) => a.currentPrice - b.currentPrice);
  else if (filters.sort === 'price-desc') visible = [...visible].sort((a, b) => b.currentPrice - a.currentPrice);
  else if (filters.sort === 'rating') visible = [...visible].sort((a, b) => (b.ratingAvg || 0) - (a.ratingAvg || 0));

  const grid = document.getElementById('menu-grid');
  if (!visible.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p class="eyebrow">Nothing here yet</p><h2 class="display">No items match</h2><p class="helper-text">Try another category or search term.</p></div>`;
    return;
  }

  grid.innerHTML = visible.map(renderCard).join('');

  grid.querySelectorAll('.item-card').forEach((card) => {
    const id = card.dataset.id;
    card.addEventListener('click', () => { window.location.href = `item.html?id=${id}`; });

    const favBtn = card.querySelector('.fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(id, favorites.includes(id));
      });
    }

    const addBtn = card.querySelector('.add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!currentUser) { window.location.href = 'login.html?next=index.html'; return; }
        addBtn.textContent = '…';
        addBtn.disabled = true;
        try { await api.post('/cart', { menuItemId: id, quantity: 1 }); addBtn.innerHTML = '<i class="fa-solid fa-check"></i>'; }
        finally { setTimeout(() => { addBtn.textContent = '+'; addBtn.disabled = false; renderNav(); }, 1000); }
      });
    }
  });
}

function renderCard(item) {
  const priceIncreased = item.previousPrice != null && item.currentPrice > item.previousPrice;
  const isFav = favorites.includes(item._id);
  return `
    <div class="card item-card rise-in" data-id="${item._id}">
      <div class="thumb">
        ${item.images?.[0] ? `<img src="${item.images[0]}" alt="">` : `<span class="thumb-placeholder display">${item.name.charAt(0)}</span>`}
        ${!item.isAvailable ? `<span class="sold-out-flag glass-circle">Sold out</span>` : ''}
        ${item.isAvailable && priceIncreased ? `<span class="price-up-flag">Price up</span>` : ''}
        ${item.ratingCount ? `<span class="card-rating-badge"><i class="fa-solid fa-star"></i>${item.ratingAvg.toFixed(1)}</span>` : ''}
        ${currentUser ? `
          <button class="fav-btn glass-circle ${isFav ? 'active' : ''}" aria-label="Toggle favorite">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? '#ff8a3d' : 'none'}">
              <path d="M12 20s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.6-9.5 9-9.5 9Z" stroke="${isFav ? '#ff8a3d' : '#f6efe4'}" stroke-width="2" stroke-linejoin="round"/>
            </svg>
          </button>` : ''}
      </div>
      <div class="item-body">
        <h3 class="item-name">${escapeHtml(item.name)}</h3>
        <div class="item-footer">
          <div>
            <span class="price">${currency(item.currentPrice)}</span>
            ${priceIncreased ? `<span class="price-old">${currency(item.previousPrice)}</span>` : ''}
          </div>
          <button class="add-btn" ${!item.isAvailable ? 'disabled' : ''} aria-label="Add to cart">+</button>
        </div>
      </div>
    </div>
  `;
}

async function toggleFavorite(id, isFav) {
  if (!currentUser) { window.location.href = 'login.html?next=index.html'; return; }
  if (isFav) {
    await api.del(`/cart/favorites/${id}`);
    favorites = favorites.filter((f) => f !== id);
  } else {
    await api.post(`/cart/favorites/${id}`, {});
    favorites.push(id);
  }
  renderGrid();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('search-input').addEventListener('input', renderGrid);

// Real-time updates - the socket connects to the same address the page was loaded from
const socket = io();
socket.on('menu:created', (item) => { upsertItem(item); if (item.isSpecial && item.isAvailable) SpecialModal.maybeShow([item]); });
socket.on('menu:updated', (item) => { upsertItem(item); });
socket.on('menu:deleted', ({ id }) => { allItems = allItems.filter((i) => i._id !== id); renderGrid(); });
socket.on('banner:updated', (banner) => {
  const exists = banners.some((b) => b._id === banner._id);
  banners = exists ? banners.map((b) => (b._id === banner._id ? banner : b)) : [banner, ...banners];
  renderBanners();
});
socket.on('banner:deleted', ({ id }) => { banners = banners.filter((b) => b._id !== id); renderBanners(); });

function upsertItem(item) {
  const exists = allItems.some((i) => i._id === item._id);
  allItems = exists ? allItems.map((i) => (i._id === item._id ? item : i)) : [item, ...allItems];
  renderCategories();
  renderGrid();
}

// ---- Filter / sort modal ----

function isFiltersActive() {
  return filters.minPrice != null || filters.maxPrice != null || filters.availableOnly || filters.sort !== 'default';
}

function updateFilterBadge() {
  document.getElementById('filter-badge-dot').style.display = isFiltersActive() ? 'block' : 'none';
}

function openFilterModal() {
  const overlay = document.createElement('div');
  overlay.className = 'ui-modal-overlay';

  const sortOptions = [
    { value: 'default', label: 'Popular' },
    { value: 'price-asc', label: 'Price: Low to High' },
    { value: 'price-desc', label: 'Price: High to Low' },
    { value: 'rating', label: 'Top Rated' },
  ];

  overlay.innerHTML = `
    <div class="filter-modal glass-strong rise-in" role="dialog" aria-modal="true">
      <div class="filter-modal-header">
        <h3>Filter & sort</h3>
        <button type="button" class="icon-btn" id="filter-close-btn" aria-label="Close" style="background:none; border:none; color:var(--ink-muted); font-size:18px;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="filter-section">
        <p class="filter-section-label">Sort by</p>
        <div class="filter-chip-row" id="filter-sort-row">
          ${sortOptions.map((o) => `<button type="button" class="filter-chip ${filters.sort === o.value ? 'active' : ''}" data-sort="${o.value}">${o.label}</button>`).join('')}
        </div>
      </div>

      <div class="filter-section">
        <p class="filter-section-label">Price range (₦)</p>
        <div class="filter-range-row">
          <input type="number" min="0" id="filter-min-price" placeholder="Min" value="${filters.minPrice ?? ''}" />
          <span class="helper-text">to</span>
          <input type="number" min="0" id="filter-max-price" placeholder="Max" value="${filters.maxPrice ?? ''}" />
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-toggle-row">
          <p class="filter-section-label" style="margin:0;">Available now only</p>
          <label class="switch">
            <input type="checkbox" id="filter-available-toggle" ${filters.availableOnly ? 'checked' : ''} />
            <span class="switch-track"></span>
          </label>
        </div>
      </div>

      <div class="filter-modal-actions">
        <button type="button" class="btn btn-ghost" id="filter-reset-btn">Reset</button>
        <button type="button" class="btn btn-primary" id="filter-apply-btn">Apply</button>
      </div>
    </div>
  `;

  let draftSort = filters.sort;

  overlay.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      draftSort = chip.dataset.sort;
      overlay.querySelectorAll('.filter-chip').forEach((c) => c.classList.toggle('active', c === chip));
    });
  });

  function close() {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 160);
  }

  overlay.querySelector('#filter-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#filter-reset-btn').addEventListener('click', () => {
    filters = { minPrice: null, maxPrice: null, availableOnly: false, sort: 'default' };
    updateFilterBadge();
    renderGrid();
    close();
  });

  overlay.querySelector('#filter-apply-btn').addEventListener('click', () => {
    const minVal = overlay.querySelector('#filter-min-price').value;
    const maxVal = overlay.querySelector('#filter-max-price').value;
    filters = {
      minPrice: minVal !== '' ? Number(minVal) : null,
      maxPrice: maxVal !== '' ? Number(maxVal) : null,
      availableOnly: overlay.querySelector('#filter-available-toggle').checked,
      sort: draftSort,
    };
    updateFilterBadge();
    renderGrid();
    close();
  });

  document.body.appendChild(overlay);
}

document.getElementById('filter-btn').addEventListener('click', openFilterModal);

loadHome();
