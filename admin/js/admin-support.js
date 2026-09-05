// Logic for the admin support inbox page.
//
// Restructured to add a Suppliers (rider) inbox alongside the existing
// customer inbox — same thread UI, same real-time/push behavior, just
// scoped by an "audience" toggle above the existing status tabs. Everything
// that already worked for customers (status tabs, resolve, assign delivery,
// real-time push-to-top-of-list) is untouched for that audience; supplier
// threads just hide the one action ("Assign delivery") that doesn't apply
// to a conversation that isn't about a specific order.

let conversations = [];
let activeUserId = new URLSearchParams(window.location.search).get('userId') || null;
let activeMessages = [];
let adminUser = null;
let activeTab = 'all';
let suppliers = [];

// 'customer' = the existing customer support inbox. 'supplier' = the new
// rider inbox. Persisted in the URL so a reload / shared link keeps you on
// the same tab.
let activeAudience = new URLSearchParams(window.location.search).get('audience') === 'supplier' ? 'supplier' : 'customer';

const AUDIENCES = [
  { key: 'customer', label: 'Customers', icon: 'fa-user' },
  { key: 'supplier', label: 'Suppliers', icon: 'fa-motorcycle' },
];

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'pending', label: 'Pending' },
  { key: 'resolved', label: 'Resolved' },
];

async function loadSupport() {
  adminUser = await requireAdmin();
  if (!adminUser) return;

  renderAudienceTabs();
  renderTabs();
  await fetchAndRenderConversations();
  api.get('/admin/suppliers').then((d) => { suppliers = d.suppliers; }).catch(() => {});

  if (activeUserId) await openConversation(activeUserId);

  document.getElementById('chat-send').addEventListener('click', sendReply);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  });

  // Live updates: new messages from EITHER audience arrive over the same
  // socket event — we just re-fetch whichever list is currently open, so a
  // customer message pinging in while you're on the Suppliers tab quietly
  // updates that badge/count next time you switch, without interrupting you.
  const socket = io();
  socket.emit('join:admin');
  socket.on('support:message', (msg) => {
    fetchAndRenderConversations();
    const msgUserId = typeof msg.user === 'string' ? msg.user : msg.user?._id;
    if (msgUserId === activeUserId) {
      activeMessages.push(msg);
      renderThread();
    }
    if (msg.sender === 'customer' || msg.sender === 'supplier') Sound.ping();
  });
}

function renderAudienceTabs() {
  const wrap = document.getElementById('audience-tabs-wrap');
  wrap.innerHTML = `
    <div class="inbox-tabs" style="margin-bottom: 10px;">
      ${AUDIENCES.map((a) => `
        <button class="inbox-tab ${activeAudience === a.key ? 'active' : ''}" data-key="${a.key}">
          <i class="fa-solid ${a.icon}"></i> ${a.label}
        </button>`).join('')}
    </div>`;
  wrap.querySelectorAll('.inbox-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchAudience(btn.dataset.key));
  });
}

async function switchAudience(key) {
  if (key === activeAudience) return;
  activeAudience = key;
  activeTab = 'all';
  activeUserId = null;
  activeMessages = [];
  history.replaceState(null, '', `support.html?audience=${activeAudience}`);

  renderAudienceTabs();
  renderTabs();

  // Reset the thread panel back to its empty state
  document.getElementById('thread-header').style.display = 'none';
  document.getElementById('thread-input-bar').style.display = 'none';
  document.getElementById('thread-order-wrap').innerHTML = '';
  document.getElementById('thread-actions-wrap').innerHTML = '';
  document.getElementById('chat-scroll').innerHTML = `<p class="helper-text">Pick a conversation on the left.</p>`;

  await fetchAndRenderConversations();
}

function conversationBucket(c) {
  if (c.unreadCount > 0) return 'open';
  if (c.lastSender === 'admin') return 'resolved';
  return 'pending';
}

function renderTabs() {
  const wrap = document.getElementById('inbox-tabs-wrap');
  wrap.innerHTML = `
    <div class="inbox-tabs">
      ${TABS.map((t) => {
        const count = t.key === 'all' ? conversations.length : conversations.filter((c) => conversationBucket(c) === t.key).length;
        return `<button class="inbox-tab ${activeTab === t.key ? 'active' : ''}" data-key="${t.key}">${t.label}${t.key !== 'all' && count ? `<span class="count">${count}</span>` : ''}</button>`;
      }).join('')}
    </div>`;
  wrap.querySelectorAll('.inbox-tab').forEach((btn) => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.key; renderTabs(); renderConvoList(); });
  });
}

async function fetchAndRenderConversations() {
  const data = await api.get(`/admin/support?role=${activeAudience}`);
  conversations = data.conversations;
  renderTabs();
  renderConvoList();
}

function initials(name) {
  return (name || 'C').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function renderConvoList() {
  const list = document.getElementById('convo-list');
  const visible = activeTab === 'all' ? conversations : conversations.filter((c) => conversationBucket(c) === activeTab);
  const emptyLabel = activeAudience === 'supplier' ? 'No rider conversations here.' : 'No conversations here.';

  if (!visible.length) {
    list.innerHTML = `<p class="helper-text">${emptyLabel}</p>`;
    return;
  }

  list.innerHTML = visible.map((c) => `
    <div class="card convo-row ${c.user._id === activeUserId ? 'active' : ''}" data-id="${c.user._id}" style="display:flex; align-items:center; gap:10px;">
      <div class="convo-avatar">${initials(c.user.name)}</div>
      <div style="flex:1; min-width:0;">
        <p class="convo-name">${c.user.name || (activeAudience === 'supplier' ? 'Rider' : 'Customer')}</p>
        <p class="convo-preview">${c.lastSender === 'admin' ? 'You: ' : ''}${c.lastMessage}</p>
      </div>
      ${c.unreadCount > 0 ? `<span class="tab-count" style="position:static;">${c.unreadCount}</span>` : ''}
    </div>
  `).join('');

  list.querySelectorAll('.convo-row').forEach((row) => {
    row.addEventListener('click', () => openConversation(row.dataset.id));
  });
}

async function openConversation(userId) {
  activeUserId = userId;
  history.replaceState(null, '', `support.html?audience=${activeAudience}&userId=${userId}`);
  renderConvoList();

  document.getElementById('thread-input-bar').style.display = 'flex';

  const convo = conversations.find((c) => c.user._id === userId);
  const header = document.getElementById('thread-header');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.gap = '10px';
  header.innerHTML = convo ? `
    <div class="convo-avatar">${initials(convo.user.name)}</div>
    <div>
      <p style="margin:0 0 4px; font-weight:600;">${convo.user.name}${activeAudience === 'supplier' ? ' · Rider' : ''}</p>
      <p class="helper-text" style="margin:0;">${convo.user.phone || convo.user.email || ''}</p>
    </div>
  ` : '';

  const data = await api.get(`/admin/support/${userId}`);
  activeMessages = data.messages;
  renderThread();
  renderThreadOrderCard();
  renderThreadActions();
  fetchAndRenderConversations(); // refresh unread badges now that we've read this thread
}

function latestOrderNumber() {
  const withOrder = [...activeMessages].reverse().find((m) => m.orderNumber);
  return withOrder?.orderNumber || null;
}

async function renderThreadOrderCard() {
  const wrap = document.getElementById('thread-order-wrap');
  const orderNumber = latestOrderNumber();
  if (!orderNumber) { wrap.innerHTML = ''; return; }

  let order = null;
  try {
    const data = await api.get(`/admin/orders?orderNumber=${encodeURIComponent(orderNumber)}`);
    order = data.orders?.[0];
  } catch (e) { /* ignore */ }
  if (!order) { wrap.innerHTML = ''; return; }

  const deliveryBadge = order.delivery?.mode === 'CHOWDECK_RELAY'
    ? `<span class="badge badge-pending" style="margin-left:8px;"><i class="fa-solid fa-motorcycle"></i> Chowdeck Relay</span>`
    : `<span class="badge badge-approved" style="margin-left:8px;"><i class="fa-solid fa-shop"></i> In-house</span>`;

  wrap.innerHTML = `
    <div class="card order-status-card">
      <div class="order-status-thumb"><i class="fa-solid fa-receipt"></i></div>
      <div class="order-status-info">
        <p class="order-status-title">Order #${order.orderNumber} ${deliveryBadge}</p>
        <p class="order-status-sub">${order.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</p>
      </div>
      <span class="price" style="font-family:var(--font-mono);">${currency(order.totalAmount)}</span>
    </div>`;
}

function renderThreadActions() {
  const wrap = document.getElementById('thread-actions-wrap');
  // "Assign delivery" only makes sense for a customer conversation tied to
  // an order — a rider's own support thread isn't about assigning anyone.
  const showAssign = activeAudience === 'customer';

  wrap.innerHTML = `
    <div style="display:flex; gap:10px; margin-top:10px; flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" id="resolve-btn"><i class="fa-solid fa-check"></i> Resolve</button>
      ${showAssign ? `<button class="btn btn-ghost btn-sm" id="assign-btn"><i class="fa-solid fa-motorcycle"></i> Assign delivery</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="more-btn"><i class="fa-solid fa-ellipsis"></i> More</button>
    </div>`;

  document.getElementById('resolve-btn').addEventListener('click', async () => {
    const ok = await UI.confirm('Send a closing note and mark this conversation as resolved?', { title: 'Resolve conversation', confirmText: 'Resolve' });
    if (!ok) return;
    await api.post(`/admin/support/${activeUserId}`, { message: "Thanks for reaching out — we're marking this as resolved. Let us know if anything else comes up!" });
    fetchAndRenderConversations();
    openConversation(activeUserId);
  });

  if (showAssign) {
    document.getElementById('assign-btn').addEventListener('click', assignDeliveryFlow);
  }

  document.getElementById('more-btn').addEventListener('click', async () => {
    const convo = conversations.find((c) => c.user._id === activeUserId);
    await UI.alert(`${convo?.user?.email || 'No email on file'}${convo?.user?.phone ? `<br>${convo.user.phone}` : ''}`, { title: activeAudience === 'supplier' ? 'Rider details' : 'Customer details' });
  });
}

async function assignDeliveryFlow() {
  const orderNumber = latestOrderNumber();
  if (!orderNumber) {
    UI.toast('No order referenced in this conversation yet.', { type: 'danger' });
    return;
  }
  if (!suppliers.length) {
    await UI.alert('No delivery riders yet. Add one from Settings → Delivery staff.', { title: 'No riders available' });
    return;
  }
  const supplierId = suppliers[0]._id; // simplest flow: assign to the first available rider
  try {
    const data = await api.get(`/admin/orders?orderNumber=${encodeURIComponent(orderNumber)}`);
    const order = data.orders?.[0];
    if (!order) return;
    await api.patch(`/admin/orders/${order._id}/assign`, { supplierId });
    UI.toast(`Assigned to ${suppliers[0].name}`, { type: 'success' });
  } catch (err) {
    UI.toast(err.message, { type: 'danger' });
  }
}

function renderThread() {
  const scroll = document.getElementById('chat-scroll');
  if (!activeMessages.length) {
    scroll.innerHTML = `<p class="helper-text">No messages yet.</p>`;
    return;
  }

  scroll.innerHTML = activeMessages.map((m) => {
    const mine = m.sender === 'admin';
    const time = new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="chat-bubble-row ${mine ? 'mine' : ''}">
        <div class="chat-bubble">
          ${m.orderNumber ? `<span class="chat-order-tag"><i class="fa-solid fa-receipt"></i> Order #${m.orderNumber}</span><br/>` : ''}
          ${escapeHtml(m.message)}
          <span class="chat-meta">${mine ? 'You' : m.senderName}${m.sender === 'supplier' ? ' · Rider' : ''} · ${time}</span>
        </div>
      </div>`;
  }).join('');
  scroll.scrollTop = scroll.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function sendReply() {
  if (!activeUserId) return;
  const input = document.getElementById('chat-input');
  const orderRefInput = document.getElementById('order-ref-input');
  const text = input.value.trim();
  if (!text) return;

  input.disabled = true;
  try {
    const data = await api.post(`/admin/support/${activeUserId}`, {
      message: text,
      orderNumber: orderRefInput.value.trim() || undefined,
    });
    activeMessages.push(data.message);
    input.value = '';
    renderThread();
    fetchAndRenderConversations();
  } finally {
    input.disabled = false;
    input.focus();
  }
}

loadSupport();
