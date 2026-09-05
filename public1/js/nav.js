// Builds the top bar and the floating bottom tab bar on every page.
// Each HTML page just needs two empty containers:
//   <div id="topbar"></div>
//   <div id="tabbar"></div>
// and includes this script. This file fills them in.

const TABS = [
  { href: 'index.html', label: 'Home', match: ['', 'index.html'] },
  { href: 'orders.html', label: 'Orders', match: ['orders.html'] },
  { href: 'cart.html', label: 'Cart', match: ['cart.html'] },
  { href: 'favorites.html', label: 'Favorite', match: ['favorites.html'] },
];

function currentPage() {
  return window.location.pathname.split('/').pop();
}

async function renderNav() {
  const topbarEl = document.getElementById('topbar');
  const tabbarEl = document.getElementById('tabbar');
  if (!topbarEl && !tabbarEl) return;

  // Find out if someone is logged in (fails quietly if not - that's fine, browsing is public)
  let user = null;
  try {
    const data = await api.get('/auth/me');
    user = data.user;
  } catch (e) { /* not logged in - totally normal on a public menu page */ }

  // Find out how many items are in the cart (only makes sense if logged in)
  let cartCount = 0;
  if (user) {
    try {
      const data = await api.get('/cart');
      cartCount = (data.cart.items || []).reduce((sum, i) => sum + i.quantity, 0);
    } catch (e) { /* ignore */ }
  }

  if (topbarEl) {
    topbarEl.innerHTML = `
      <a href="index.html" class="brand-name display">Mama Tolu's Kitchen</a>
      <div class="topbar-actions">
        ${user ? '<a href="support.html" class="btn btn-ghost btn-sm">Support</a>' : ''}
        ${user?.role === 'admin' ? '<a href="/admin" class="btn btn-ghost btn-sm">Admin</a>' : ''}
        ${user
          ? `<a href="account.html" class="btn btn-ghost btn-sm">${user.name.split(' ')[0]}</a>`
          : '<a href="login.html" class="btn btn-primary btn-sm">Log in</a>'}
      </div>
    `;
    topbarEl.className = 'topbar';
  }

  if (tabbarEl) {
    const page = currentPage();
    tabbarEl.className = 'tabbar glass-strong';
    tabbarEl.innerHTML = TABS.map((tab) => {
      const active = tab.match.includes(page);
      const countBadge = tab.href === 'cart.html' && cartCount > 0
        ? `<span class="tab-count">${cartCount}</span>` : '';
      return `
        <a href="${tab.href}" class="tab ${active ? 'active' : ''}">
          <span class="tab-icon-wrap">${tabIcon(tab.label, active)}${countBadge}</span>
          <span class="tab-label">${tab.label}</span>
        </a>`;
    }).join('');
  }
}

function tabIcon(label, active) {
  const c = active ? '#ff8a3d' : '#7e7364';
  const icons = {
    Home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 11.5 12 4l8 7.5" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    Orders: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="${c}" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h3" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`,
    Cart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20 8H6" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="20.5" r="1.4" fill="${c}"/><circle cx="17.5" cy="20.5" r="1.4" fill="${c}"/></svg>`,
    Favorite: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${active ? c : 'none'}"><path d="M12 20s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.6-9.5 9-9.5 9Z" stroke="${c}" stroke-width="2" stroke-linejoin="round"/></svg>`,
  };
  return icons[label] || '';
}

renderNav();

// Register the service worker so the browser can offer "Add to Home Screen" / "Install app".
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* not critical if this fails */ });
  });
}
