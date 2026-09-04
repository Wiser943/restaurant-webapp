// Builds the admin nav bar and checks that the logged-in user is actually an admin.
// Every admin page includes this and calls requireAdmin() before doing anything else.

async function requireAdmin() {
  try {
    const data = await api.get('/auth/me');
    if (data.user.role !== 'admin') { window.location.href = '/index.html'; return null; }
    renderAdminNav(data.user);
    return data.user;
  } catch (e) {
    window.location.href = '/login.html?next=/admin/index.html';
    return null;
  }
}

function renderAdminNav(user) {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const el = document.getElementById('admin-nav');
  if (!el) return;
  const links = [
    { href: 'index.html', label: 'Orders' },
    { href: 'menu.html', label: 'Menu' },
    { href: 'support.html', label: 'Support' },
    { href: 'settings.html', label: 'Settings' },
  ];
  el.innerHTML = `
    <div class="topbar">
      <a href="index.html" class="brand-name display">Admin · Mama Tolu's</a>
      <div class="topbar-actions">
        <a href="/index.html" class="btn btn-ghost btn-sm">View site</a>
        <button id="admin-logout" class="btn btn-ghost btn-sm">Log out</button>
      </div>
    </div>
    <nav class="admin-nav">
      ${links.map((l) => `<a href="${l.href}" class="${page === l.href ? 'active' : ''}">${l.label}</a>`).join('')}
    </nav>
  `;
  document.getElementById('admin-logout').addEventListener('click', async () => {
    await api.post('/auth/logout', {});
    window.location.href = '/index.html';
  });
}
