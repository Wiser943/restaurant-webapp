// Logic for the "Admin Profile" page.

let adminUser = null;

async function loadAdminProfile() {
  adminUser = await requireAdmin();
  if (!adminUser) return;

  const [ordersData, menuData, suppliersData] = await Promise.allSettled([
    api.get('/admin/orders'),
    api.get('/menu'),
    api.get('/admin/suppliers'),
  ]);

  const totalOrders = ordersData.status === 'fulfilled' ? ordersData.value.orders.length : 0;
  const pending = ordersData.status === 'fulfilled' ? ordersData.value.orders.filter((o) => o.paymentStatus === 'pending').length : 0;
  const activeItems = menuData.status === 'fulfilled' ? menuData.value.items.filter((i) => i.isAvailable).length : 0;
  const teamMembers = suppliersData.status === 'fulfilled' ? suppliersData.value.suppliers.length : 0;

  render({ totalOrders, pending, activeItems, teamMembers });
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function render(stats) {
  const u = adminUser;
  document.getElementById('profile-content').innerHTML = `
    <div class="profile-identity">
      <div class="profile-avatar-wrap">
        ${u.avatarUrl ? `<img src="${u.avatarUrl}" class="profile-avatar" alt="${u.name}" />` : `<div class="profile-avatar">${initials(u.name)}</div>`}
        <button class="profile-avatar-cam" id="avatar-btn" aria-label="Change photo"><i class="fa-solid fa-camera"></i></button>
      </div>
      <div class="profile-name-block">
        <h2>${escapeHtml(u.name)} <i class="fa-solid fa-shield-halved" style="color:var(--orange); font-size:14px;"></i></h2>
        <p>${escapeHtml(u.email)}</p>
        <span class="role-chip admin"><i class="fa-solid fa-crown"></i> Administrator</span>
      </div>
    </div>

    <div class="profile-stats">
      <div class="profile-stat"><i class="fa-solid fa-bag-shopping"></i><span class="stat-num">${stats.totalOrders}</span><span class="stat-lbl">Total Orders</span></div>
      <div class="profile-stat"><i class="fa-solid fa-burger"></i><span class="stat-num">${stats.activeItems}</span><span class="stat-lbl">Active Items</span></div>
      <div class="profile-stat"><i class="fa-solid fa-people-group"></i><span class="stat-num">${stats.teamMembers}</span><span class="stat-lbl">Members</span></div>
      <div class="profile-stat"><i class="fa-solid fa-hourglass-half"></i><span class="stat-num">${stats.pending}</span><span class="stat-lbl">Pending</span></div>
    </div>

    <div class="profile-section">
      <p class="profile-section-title">Admin Panel</p>
      <div class="card profile-row-list">
        <div class="profile-row" onclick="window.location.href='index.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-chart-simple"></i></span>
          <span class="profile-row-label">Dashboard</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" onclick="window.location.href='index.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-bag-shopping"></i></span>
          <span class="profile-row-label">Manage Orders</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" onclick="window.location.href='menu.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-utensils"></i></span>
          <span class="profile-row-label">Manage Menu</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" onclick="window.location.href='users.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-users"></i></span>
          <span class="profile-row-label">Customers &amp; Suppliers</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" onclick="window.location.href='settings.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-gear"></i></span>
          <span class="profile-row-label">Settings</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
      </div>
    </div>

    <div class="profile-section">
      <p class="profile-section-title">Account</p>
      <div class="card profile-row-list">
        <div class="profile-row" id="row-personal">
          <span class="profile-row-icon"><i class="fa-solid fa-id-card"></i></span>
          <span class="profile-row-label">Personal Information</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" id="row-password">
          <span class="profile-row-icon"><i class="fa-solid fa-lock"></i></span>
          <span class="profile-row-label">Change Password</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" id="row-notifications">
          <span class="profile-row-icon"><i class="fa-solid fa-bell"></i></span>
          <span class="profile-row-label">Notification Preferences</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
      </div>
    </div>

    <div class="card profile-row-list">
      <div class="profile-row danger" id="logout-row">
        <span class="profile-row-icon"><i class="fa-solid fa-right-from-bracket"></i></span>
        <span class="profile-row-label">Log Out</span>
      </div>
    </div>
  `;

  document.getElementById('avatar-btn').addEventListener('click', changeAvatar);
  document.getElementById('row-personal').addEventListener('click', editPersonalInfo);
  document.getElementById('row-password').addEventListener('click', changePassword);
  document.getElementById('row-notifications').addEventListener('click', async () => {
    try { await Push.subscribe(); UI.toast('Notifications enabled on this device.', { type: 'success' }); }
    catch (e) { UI.toast('Could not enable notifications.', { type: 'danger' }); }
  });
  document.getElementById('logout-row').addEventListener('click', async () => {
    const ok = await UI.confirm('You will need to log in again to access the admin panel.', { title: 'Log out?', confirmText: 'Log out', danger: true });
    if (!ok) return;
    await api.post('/auth/logout', {});
    window.location.href = '/index.html';
  });
}

async function changeAvatar() {
  const url = await UI.prompt('Paste a link to your new profile photo.', { title: 'Change photo', defaultValue: adminUser.avatarUrl || '' });
  if (url === null) return;
  try {
    const data = await api.patch('/auth/profile', { avatarUrl: url });
    adminUser = data.user;
    UI.toast('Profile photo updated', { type: 'success' });
    loadAdminProfile();
  } catch (err) { UI.toast(err.message, { type: 'danger' }); }
}

async function editPersonalInfo() {
  const name = await UI.prompt('Update your display name.', { title: 'Personal information', defaultValue: adminUser.name });
  if (name === null) return;
  try {
    const data = await api.patch('/auth/profile', { name });
    adminUser = data.user;
    UI.toast('Profile updated', { type: 'success' });
    loadAdminProfile();
  } catch (err) { UI.toast(err.message, { type: 'danger' }); }
}

async function changePassword() {
  const current = await UI.prompt('Enter your current password.', { title: 'Change password', inputType: 'password' });
  if (!current) return;
  const next = await UI.prompt('Enter a new password (at least 6 characters).', { title: 'Change password', inputType: 'password' });
  if (!next) return;
  try {
    await api.patch('/auth/password', { currentPassword: current, newPassword: next });
    UI.toast('Password updated', { type: 'success' });
  } catch (err) { UI.toast(err.message, { type: 'danger' }); }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadAdminProfile();
