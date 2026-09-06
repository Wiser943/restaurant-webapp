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

async function loadHome() {
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
  const visible = allItems
    .filter((i) => activeCategory === 'All' || i.category === activeCategory)
    .filter((i) => i.name.toLowerCase().includes(search));

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
socket.on('menu:created', (item) => { upsertItem(item); });
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

loadHome();
