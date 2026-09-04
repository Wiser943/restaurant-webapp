// Checks the logged-in user is actually a delivery rider, and renders the
// small top bar every supplier page uses.

async function requireSupplier() {
  try {
    const data = await api.get('/auth/me');
    if (data.user.role !== 'supplier') { window.location.href = '/index.html'; return null; }
    renderSupplierNav(data.user);
    return data.user;
  } catch (e) {
    window.location.href = '/login.html?next=/supplier/index.html';
    return null;
  }
}

function renderSupplierNav(user) {
  const el = document.getElementById('supplier-nav');
  if (!el) return;
  el.innerHTML = `
    <div class="topbar">
      <span class="brand-name display"><i class="fa-solid fa-motorcycle"></i> Rider · ${user.name.split(' ')[0]}</span>
      <div class="topbar-actions">
        <button id="supplier-logout" class="btn btn-ghost btn-sm">Log out</button>
      </div>
    </div>
  `;
  document.getElementById('supplier-logout').addEventListener('click', async () => {
    await api.post('/auth/logout', {});
    window.location.href = '/index.html';
  });
}
