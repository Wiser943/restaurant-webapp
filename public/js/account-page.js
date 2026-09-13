// Logic for the customer "My Profile" page.

let profileUser = null;
let profileOrders = [];
let profileCartCount = 0;
let profileAddresses = [];

async function loadAccount() {
  try { profileUser = (await api.get('/auth/me')).user; }
  catch (e) { window.location.href = 'login.html?next=account.html'; return; }

  try { profileOrders = (await api.get('/orders')).orders || []; } catch (e) { profileOrders = []; }
  try {
    const cart = (await api.get('/cart')).cart;
    profileCartCount = (cart.items || []).reduce((s, i) => s + i.quantity, 0);
  } catch (e) { profileCartCount = 0; }
  try { profileAddresses = (await api.get('/auth/addresses')).addresses || []; } catch (e) { profileAddresses = []; }

  render();
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function render() {
  const u = profileUser;
  const latestOrder = profileOrders[0];

  document.getElementById('account-content').innerHTML = `
    <div class="profile-identity">
      <div class="profile-avatar-wrap">
        ${u.avatarUrl
          ? `<img src="${u.avatarUrl}" class="profile-avatar" alt="${u.name}" />`
          : `<div class="profile-avatar">${initials(u.name)}</div>`}
        <button class="profile-avatar-cam" id="avatar-btn" aria-label="Change photo"><i class="fa-solid fa-camera"></i></button>
      </div>
      <div class="profile-name-block">
        <h2>${escapeHtml(u.name)}</h2>
        <p>${escapeHtml(u.email)}</p>
        <span class="role-chip"><i class="fa-solid fa-utensils"></i> Food Lover</span>
      </div>
    </div>

    <div class="profile-stats">
      <div class="profile-stat"><i class="fa-solid fa-bag-shopping"></i><span class="stat-num">${profileOrders.length}</span><span class="stat-lbl">Orders</span></div>
      <div class="profile-stat"><i class="fa-solid fa-heart"></i><span class="stat-num">${(u.favorites || []).length}</span><span class="stat-lbl">Favorites</span></div>
      <div class="profile-stat"><i class="fa-solid fa-cart-shopping"></i><span class="stat-num">${profileCartCount}</span><span class="stat-lbl">In Cart</span></div>
      <div class="profile-stat"><i class="fa-solid fa-location-dot"></i><span class="stat-num">${profileAddresses.length}</span><span class="stat-lbl">Addresses</span></div>
    </div>

    ${latestOrder ? `
      <div class="card profile-preview-card">
        <div class="profile-preview-head">
          <h3>My Orders</h3>
          <a href="orders.html">View All</a>
        </div>
        <div class="profile-order-row" onclick="window.location.href='order.html?id=${latestOrder._id}'">
          ${orderThumbHtml(latestOrder)}
          <div class="profile-order-info">
            <p class="o-name">${escapeHtml(latestOrder.items?.[0]?.name || 'Order')}${latestOrder.items?.length > 1 ? ` + ${latestOrder.items.length - 1} more` : ''}</p>
            <p class="o-meta">${new Date(latestOrder.createdAt).toLocaleDateString()} · ${friendlyStatus(latestOrder.orderStatus)}</p>
          </div>
          <div class="profile-order-price">${currency(latestOrder.totalAmount)}</div>
        </div>
      </div>
    ` : ''}

    <div class="profile-section">
      <p class="profile-section-title">Preferences</p>
      <div class="card profile-row-list">
        <div class="profile-row" id="row-addresses">
          <span class="profile-row-icon"><i class="fa-solid fa-location-dot"></i></span>
          <span class="profile-row-label">Addresses</span>
          <span class="profile-row-trailing">${profileAddresses.length} saved</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" onclick="window.location.href='favorites.html'">
          <span class="profile-row-icon"><i class="fa-solid fa-heart"></i></span>
          <span class="profile-row-label">Favorite Items</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" id="row-notifications">
          <span class="profile-row-icon"><i class="fa-solid fa-bell"></i></span>
          <span class="profile-row-label">Notifications</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
        <div class="profile-row" id="row-password">
          <span class="profile-row-icon"><i class="fa-solid fa-lock"></i></span>
          <span class="profile-row-label">Change Password</span>
          <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
        </div>
      </div>
    </div>

    <div class="card profile-row-list" style="margin-bottom:18px;">
      <div class="profile-row" onclick="window.location.href='support.html'">
        <span class="profile-row-icon"><i class="fa-solid fa-circle-question"></i></span>
        <span class="profile-row-label">Help &amp; Support</span>
        <i class="fa-solid fa-chevron-right profile-row-chevron"></i>
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
  document.getElementById('row-addresses').addEventListener('click', () => { window.location.href = 'addresses.html'; });
  document.getElementById('row-notifications').addEventListener('click', openNotifications);
  document.getElementById('row-password').addEventListener('click', openChangePassword);
  document.getElementById('logout-row').addEventListener('click', async () => {
    const ok = await UI.confirm('You will need to log in again to place new orders.', { title: 'Log out?', confirmText: 'Log out', danger: true });
    if (!ok) return;
    await api.post('/auth/logout', {});
    window.location.href = 'index.html';
  });
}

// Builds the small thumbnail next to the "My Orders" preview row. Falls
// back to a lettered placeholder (instead of just hiding the <img>) when
// there's no image on the order's first item, or if the image URL fails
// to load.
function orderThumbHtml(order) {
  const src = order.items?.[0]?.menuItem?.images?.[0];
  const label = (order.items?.[0]?.name || 'Order').charAt(0).toUpperCase();
  if (!src) {
    return `<div class="profile-order-thumb profile-order-thumb-placeholder">${escapeHtml(label)}</div>`;
  }
  return `<img class="profile-order-thumb" src="${src}" alt="${escapeHtml(order.items?.[0]?.name || 'Order')}" onerror="thumbFallback(this, '${escapeHtml(label).replace(/'/g, "\\'")}')" />`;
}

// Swaps a broken <img> for the same placeholder div used when there's no
// image URL at all, so a dead link never just leaves an empty gap.
function thumbFallback(imgEl, label) {
  const div = document.createElement('div');
  div.className = 'profile-order-thumb profile-order-thumb-placeholder';
  div.textContent = label;
  imgEl.replaceWith(div);
}

function friendlyStatus(status) {
  const map = {
    pending: 'Awaiting review', awaiting_payment: 'Awaiting payment', preparing: 'Preparing',
    out_for_delivery: 'Out for delivery', completed: 'Delivered', cancelled: 'Cancelled',
  };
  return map[status] || status;
}

async function changeAvatar() {
  const url = await UI.prompt('Paste a link to your new profile photo.', { title: 'Change photo', defaultValue: profileUser.avatarUrl || '', confirmText: 'Save' });
  if (url === null) return;
  try {
    const data = await api.patch('/auth/profile', { avatarUrl: url });
    profileUser = data.user;
    UI.toast('Profile photo updated', { type: 'success' });
    render();
  } catch (err) {
    UI.toast(err.message, { type: 'danger' });
  }
}

async function openNotifications() {
  try {
    await Push.subscribe();
    UI.toast('Push notifications are enabled on this device.', { type: 'success' });
  } catch (e) {
    UI.toast('Could not enable notifications — check your browser permissions.', { type: 'danger' });
  }
}

async function openChangePassword() {
  const current = await UI.prompt('Enter your current password.', { title: 'Change password', inputType: 'password' });
  if (!current) return;
  const next = await UI.prompt('Enter a new password (at least 6 characters).', { title: 'Change password', inputType: 'password' });
  if (!next) return;
  try {
    await api.patch('/auth/password', { currentPassword: current, newPassword: next });
    UI.toast('Password updated', { type: 'success' });
  } catch (err) {
    UI.toast(err.message, { type: 'danger' });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadAccount();
