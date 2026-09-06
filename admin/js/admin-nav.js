// Builds the admin nav bar and checks that the logged-in user is actually an admin.
// Every admin page includes this and calls requireAdmin() before doing anything else.

async function requireAdmin() {
  try {
    const data = await api.get('/auth/me');
    if (data.user.role !== 'admin') { window.location.href = '/index.html'; return null; }
    renderAdminNav(data.user);
    Push.subscribe();
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
    { href: '/index.html', label: 'View site' }
  ];
  el.innerHTML = `
    <div class="topbar">
      <a href="index.html" class="brand-name display">VC Kitchen</a>
      <div class="topbar-actions">
        <a href="profile.html" class="profile-icon-btn" style="width:36px;height:36px;" aria-label="Admin profile"><i class="fa-solid fa-user"></i></a>
      </div>
    </div>
    <nav class="admin-nav">
      ${links.map((l) => `<a href="${l.href}" class="${page === l.href ? 'active' : ''}">${l.label}</a>`).join('')}
    </nav>
  `;
}
