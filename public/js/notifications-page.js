// Builds the notifications feed from the things that actually happen to a
// customer's account: order status changes, payment outcomes, and a welcome
// note. There's no separate "notification" record in the database - this
// page reconstructs the feed from /orders each time, and stays live via the
// same per-user socket room the order-detail page uses.

const STATUS_META = {
  pending: { icon: 'fa-hourglass-half', variant: '', title: 'Order received', text: (o) => `Order #${orderLabel(o)} is awaiting confirmation.` },
  confirmed: { icon: 'fa-circle-check', variant: 'notif-success', title: 'Order confirmed', text: (o) => `Order #${orderLabel(o)} has been confirmed.` },
  preparing: { icon: 'fa-fire-burner', variant: '', title: 'Preparing your food', text: (o) => `Order #${orderLabel(o)} is being prepared in the kitchen.` },
  out_for_delivery: { icon: 'fa-motorcycle', variant: '', title: 'Out for delivery', text: (o) => `Order #${orderLabel(o)} is on its way to you.` },
  completed: { icon: 'fa-box-open', variant: 'notif-success', title: 'Delivered', text: (o) => `Order #${orderLabel(o)} was delivered. Enjoy!` },
  cancelled: { icon: 'fa-circle-xmark', variant: 'notif-danger', title: 'Order cancelled', text: (o) => `Order #${orderLabel(o)} was cancelled.` },
};

function orderLabel(o) {
  return o.orderNumber || o._id.slice(-6).toUpperCase();
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function buildItems(user, orders) {
  const items = [{
    icon: 'fa-hand-peace',
    variant: '',
    title: `Welcome to VC Kitchen, ${user.name.split(' ')[0]}!`,
    sub: 'Explore the menu and place your first order.',
    date: user.createdAt || new Date().toISOString(),
  }];

  orders.forEach((o) => {
    const meta = STATUS_META[o.orderStatus] || STATUS_META.pending;
    items.push({
      icon: meta.icon,
      variant: meta.variant,
      title: meta.title,
      sub: meta.text(o),
      date: o.updatedAt || o.createdAt,
      link: `order.html?id=${o._id}`,
    });

    if (o.paymentStatus === 'rejected') {
      items.push({
        icon: 'fa-triangle-exclamation',
        variant: 'notif-danger',
        title: 'Payment not approved',
        sub: `We couldn't confirm payment for order #${orderLabel(o)}.${o.rejectionReason ? ' ' + o.rejectionReason : ''}`,
        date: o.reviewedAt || o.updatedAt,
        link: `order.html?id=${o._id}`,
      });
    }
  });

  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return items;
}

function renderItems(items) {
  const list = document.getElementById('notif-list');
  if (!items.length) {
    list.innerHTML = `<div class="empty-state"><p class="eyebrow">Nothing yet</p><h2 class="display" style="font-size:20px;">You're all caught up</h2></div>`;
    return;
  }
  list.innerHTML = items.map((n) => {
    const tagOpen = n.link ? `<a href="${n.link}"` : '<div';
    const tagClose = n.link ? '</a>' : '</div>';
    return `
      ${tagOpen} class="card notif-item rise-in">
        <div class="notif-icon ${n.variant}"><i class="fa-solid ${n.icon}"></i></div>
        <div class="notif-body">
          <p class="notif-title">${escapeHtml(n.title)}</p>
          <p class="notif-sub">${escapeHtml(n.sub)}</p>
          <p class="notif-time">${timeAgo(n.date)}</p>
        </div>
      ${tagClose}`;
  }).join('');
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');

  let user = null;
  try { user = (await api.get('/auth/me')).user; } catch (e) { /* logged out */ }

  if (!user) {
    list.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">Log in to see updates</p>
        <h2 class="display" style="font-size:20px;">Order &amp; account notifications live here</h2>
        <a href="login.html?next=notifications.html" class="btn btn-primary" style="margin-top:16px;">Log in</a>
      </div>`;
    return;
  }

  let orders = [];
  try {
    const data = await api.get('/orders');
    orders = Array.isArray(data) ? data : (data?.orders || data?.data || []);
  } catch (e) { /* ignore, we still show the welcome note */ }

  renderItems(buildItems(user, orders));

  try { localStorage.setItem('vck_notif_last_seen', String(Date.now())); } catch (e) { /* ignore */ }

  // Stay live: if a status changes while this page is open, refresh the feed.
  try {
    const socket = io();
    socket.emit('join:user', user._id);
    socket.on('order:statusChanged', async () => {
      try {
        const data = await api.get('/orders');
        const fresh = Array.isArray(data) ? data : (data?.orders || data?.data || []);
        renderItems(buildItems(user, fresh));
        localStorage.setItem('vck_notif_last_seen', String(Date.now()));
      } catch (e) { /* ignore */ }
    });
  } catch (e) { /* socket not available - the static list above still works */ }
}

loadNotifications();
