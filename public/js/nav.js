// Builds the top bar and the floating bottom tab bar on every page.
// Each HTML page just needs two empty containers:
//   <div id="topbar"></div>
//   <div id="tabbar"></div>
// and includes this script. This file fills them in. It also owns two
// other cross-page bits: gently steering logged-out visitors back through
// the onboarding carousel every so often, and showing our own "install the
// app" banner (separate from the browser's native one).

const TABS = [
  { href: 'index.html', label: 'Home', match: ['', 'index.html'] },
  { href: 'orders.html', label: 'Orders', match: ['orders.html'] },
  { href: 'cart.html', label: 'Cart', match: ['cart.html'] },
  { href: 'favorites.html', label: 'Favorite', match: ['favorites.html'] },
  { href: 'account.html', label: 'Profile', match: ['account.html'] },
];

// Pages that are already part of the "getting in" flow - never redirect to
// onboarding from these, and never show the install banner on top of them.
const ENTRY_FLOW_PAGES = ['onboarding.html', 'login.html', 'signup.html'];

// How often a logged-out visitor gets nudged back through onboarding.
const ONBOARDING_RESHOW_DAYS = 14;
// How often the custom install banner is allowed to reappear once dismissed.
const INSTALL_RESHOW_DAYS = 4;

function currentPage() {
  return window.location.pathname.split('/').pop();
}

// Returns true if it just redirected the page away. index.html also does its
// own instant check before this file even loads, for a true first-ever-visit;
// this one covers the periodic "from time to time" re-show for people
// browsing while logged out.
function maybeRedirectToOnboarding(isLoggedIn) {
  if (isLoggedIn) return false;
  if (ENTRY_FLOW_PAGES.includes(currentPage())) return false;
  if (currentPage() !== 'index.html' && currentPage() !== '') return false;

  let last = 0;
  try { last = Number(localStorage.getItem('vck_onboarding_last_shown') || 0); } catch (e) { /* ignore */ }
  const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
  if (last && daysSince < ONBOARDING_RESHOW_DAYS) return false;

  try { localStorage.setItem('vck_onboarding_last_shown', String(Date.now())); } catch (e) { /* ignore */ }
  window.location.replace('onboarding.html');
  return true;
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
    Push.subscribe(); // fire-and-forget; no-op if already subscribed or permission not granted yet
  } catch (e) { /* not logged in - totally normal on a public menu page */ }

  if (maybeRedirectToOnboarding(!!user)) return; // page is navigating away, nothing left to render

  // Find out how many items are in the cart, and whether there's anything
  // new since the person last opened Notifications (only makes sense if logged in).
  let cartCount = 0;
  let hasUnseenNotifications = false;
  if (user) {
    try {
      const data = await api.get('/cart');
      cartCount = (data.cart.items || []).reduce((sum, i) => sum + i.quantity, 0);
    } catch (e) { /* ignore */ }

    try {
      const data = await api.get('/orders');
      const orders = Array.isArray(data) ? data : (data?.orders || data?.data || []);
      const latest = orders.reduce((max, o) => Math.max(max, new Date(o.updatedAt || o.createdAt).getTime()), 0);
      let lastSeen = 0;
      try { lastSeen = Number(localStorage.getItem('vck_notif_last_seen') || 0); } catch (e) { /* ignore */ }
      hasUnseenNotifications = latest > lastSeen;
    } catch (e) { /* ignore */ }
  }

  if (topbarEl) {
    topbarEl.innerHTML = `
      <div class="topbar-left">
        <button class="bell-btn glass-circle" id="notif-bell" aria-label="Notifications">
          <i class="fa-solid fa-bell"></i>
          ${hasUnseenNotifications ? '<span class="bell-dot"></span>' : ''}
        </button>
        <a href="index.html" class="brand-name display">VC Kitchen</a>
      </div>
      <nav class="topbar-nav-links">
        ${TABS.map((tab) => {
          const active = tab.match.includes(currentPage());
          return `<a href="${tab.href}" class="${active ? 'active' : ''}">${tab.label}</a>`;
        }).join('')}
      </nav>
      <div class="topbar-actions">
        <button type="button" class="glass-circle theme-toggle-btn" data-theme-toggle style="width:36px;height:36px;" aria-label="Toggle dark / light theme">
          <i class="fa-solid fa-moon theme-icon-dark"></i>
          <i class="fa-solid fa-sun theme-icon-light"></i>
        </button>
        ${user?.role === 'admin' ? '<a href="/admin" class="btn btn-ghost btn-sm">Admin</a>' : ''}
        ${user ? '' : '<a href="login.html" class="btn btn-primary btn-sm">Log in</a>'}
      </div>
    `;
    topbarEl.className = 'topbar';
    document.getElementById('notif-bell').addEventListener('click', () => {
      window.location.href = 'notifications.html';
    });
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

  maybeShowInstallBanner();
}

function tabIcon(label, active) {
  const c = active ? '#ff8a3d' : '#7e7364';
  const icons = {
    Home: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 11.5 12 4l8 7.5" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    Orders: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="5" y="3" width="14" height="18" rx="2" stroke="${c}" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h3" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`,
    Cart: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.2 11.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L20 8H6" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="20.5" r="1.4" fill="${c}"/><circle cx="17.5" cy="20.5" r="1.4" fill="${c}"/></svg>`,
    Favorite: `<svg width="20" height="20" viewBox="0 0 24 24" fill="${active ? c : 'none'}"><path d="M12 20s-7-4.4-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.6-9.5 9-9.5 9Z" stroke="${c}" stroke-width="2" stroke-linejoin="round"/></svg>`,
    Profile: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.4" stroke="${c}" stroke-width="2"/><path d="M4.5 20c1.4-3.6 4.4-5.6 7.5-5.6s6.1 2 7.5 5.6" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`,
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

// ============================================================
// Custom "install the app" banner
// This lives ALONGSIDE the browser's own install prompt - it's a branded
// nudge that can show up periodically (first visit, then every few days
// until installed), not just the one-shot native Chrome mini-infobar.
// ============================================================
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // stop the bare native mini-infobar; we show our own banner instead
  deferredInstallPrompt = e;
});
window.addEventListener('appinstalled', () => {
  try { localStorage.setItem('vck_install_done', '1'); } catch (e) { /* ignore */ }
});

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function maybeShowInstallBanner() {
  if (isStandaloneApp()) return; // already running as the installed app
  if (ENTRY_FLOW_PAGES.includes(currentPage())) return; // don't clutter the onboarding/login/signup screens
  if (document.getElementById('install-banner')) return;

  let installed = false, last = 0;
  try {
    installed = localStorage.getItem('vck_install_done') === '1';
    last = Number(localStorage.getItem('vck_install_prompt_last') || 0);
  } catch (e) { /* ignore */ }
  if (installed) return;

  const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
  if (last && daysSince < INSTALL_RESHOW_DAYS) return;

  // Give the page a moment to settle before popping this up.
  setTimeout(() => {
    if (!deferredInstallPrompt && !isIOSDevice()) return; // nothing this browser can do anyway
    showInstallBanner();
  }, 1400);
}

function showInstallBanner() {
  try { localStorage.setItem('vck_install_prompt_last', String(Date.now())); } catch (e) { /* ignore */ }

  const el = document.createElement('div');
  el.id = 'install-banner';
  el.className = 'install-banner glass-strong';
  el.innerHTML = `
    <div class="install-banner-icon"><i class="fa-solid fa-utensils"></i></div>
    <div class="install-banner-copy">
      <p class="install-banner-title">Get the VC Kitchen app</p>
      <p class="install-banner-sub">${isIOSDevice() ? 'Tap Share, then "Add to Home Screen"' : 'Faster ordering, right from your home screen'}</p>
    </div>
    <div class="install-banner-actions">
      ${isIOSDevice() ? '' : '<button class="btn btn-primary btn-sm" id="install-accept">Install</button>'}
      <button class="btn btn-ghost btn-sm btn-icon" id="install-dismiss" aria-label="Dismiss"><i class="fa-solid fa-xmark"></i></button>
    </div>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  document.getElementById('install-dismiss').addEventListener('click', () => closeInstallBanner(el));

  const acceptBtn = document.getElementById('install-accept');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', async () => {
      closeInstallBanner(el);
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      try {
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') localStorage.setItem('vck_install_done', '1');
      } catch (e) { /* ignore */ }
      deferredInstallPrompt = null;
    });
  }
}

function closeInstallBanner(el) {
  el.classList.remove('show');
  setTimeout(() => el.remove(), 250);
}
