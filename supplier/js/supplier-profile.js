// Logic for the rider's "My Profile" page.

let riderUser = null;

async function loadSupplierProfile() {
  riderUser = await requireSupplier();
  if (!riderUser) return;

  let orders = [];
  try { orders = (await api.get('/supplier/orders')).orders || []; } catch (e) { /* ignore */ }

  const completed = orders.filter((o) => o.orderStatus === 'delivered').length;
  const active = orders.filter((o) => ['preparing', 'out_for_delivery'].includes(o.orderStatus)).length;

  render({ total: orders.length, completed, active });
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function render(stats) {
  const u = riderUser;
  document.getElementById('profile-content').innerHTML = `
    <div class="profile-identity">
      <div class="profile-avatar-wrap">
        ${u.avatarUrl ? `<img src="${u.avatarUrl}" class="profile-avatar" alt="${u.name}" />` : `<div class="profile-avatar">${initials(u.name)}</div>`}
        <button class="profile-avatar-cam" id="avatar-btn" aria-label="Change photo"><i class="fa-solid fa-camera"></i></button>
      </div>
      <div class="profile-name-block">
        <h2>${escapeHtml(u.name)}</h2>
        <p>${escapeHtml(u.email)}</p>
        <span class="role-chip supplier"><i class="fa-solid fa-motorcycle"></i> Delivery Partner</span>
      </div>
    </div>

    <div class="profile-stats">
      <div class="profile-stat"><i class="fa-solid fa-boxes-packing"></i><span class="stat-num">${stats.total}</span><span class="stat-lbl">Assigned</span></div>
      <div class="profile-stat"><i class="fa-solid fa-route"></i><span class="stat-num">${stats.active}</span><span class="stat-lbl">In Progress</span></div>
      <div class="profile-stat"><i class="fa-solid fa-circle-check"></i><span class="stat-num">${stats.completed}</span><span class="stat-lbl">Completed</span></div>
      <div class="profile-stat"><i class="fa-solid fa-signal"></i><span class="stat-num">${u.isActive === false ? 'Off' : 'On'}</span><span class="stat-lbl">Status</span></div>
    </div>

    <div class="profile-section">
      <p class="profile-section-title">Work</p>
      <div class="card profile-row-list">
        <div class="profile-row" onclick="window.location.href='index.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-motorcycle"></i></span>
          <span class="profile-row-label">My Deliveries</span>
          <span class="profile-row-trailing">${stats.active} active</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" onclick="window.location.href='support.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-headset"></i></span>
          <span class="profile-row-label">Support</span>
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
          <span class="profile-row-label">Notifications</span>
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
    const ok = await UI.confirm('You will need to log in again to see your deliveries.', { title: 'Log out?', confirmText: 'Log out', danger: true });
    if (!ok) return;
    await api.post('/auth/logout', {});
    window.location.href = '/index.html';
  });
}

async function changeAvatar() {
  const url = await UI.prompt('Paste a link to your new profile photo.', { title: 'Change photo', defaultValue: riderUser.avatarUrl || '' });
  if (url === null) return;
  try {
    const data = await api.patch('/auth/profile', { avatarUrl: url });
    riderUser = data.user;
    UI.toast('Profile photo updated', { type: 'success' });
    loadSupplierProfile();
  } catch (err) { UI.toast(err.message, { type: 'danger' }); }
}

async function editPersonalInfo() {
  const name = await UI.prompt('Update your display name.', { title: 'Personal information', defaultValue: riderUser.name });
  if (name === null) return;
  try {
    const data = await api.patch('/auth/profile', { name });
    riderUser = data.user;
    UI.toast('Profile updated', { type: 'success' });
    loadSupplierProfile();
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

loadSupplierProfile();
