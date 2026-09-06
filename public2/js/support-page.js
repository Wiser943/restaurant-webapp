// Logic for the customer-facing support chat page (support.html)

let currentUser = null;
let messages = [];
let attachedOrderNumber = new URLSearchParams(window.location.search).get('order') || null;
let attachedOrder = null;
let activeQuickIssue = null;

const QUICK_ISSUES = [
  { key: 'order', icon: 'fa-bag-shopping', label: 'Order issue', template: 'My order is taking longer than expected.' },
  { key: 'payment', icon: 'fa-credit-card', label: 'Payment', template: 'I have a question about my payment.' },
  { key: 'refund', icon: 'fa-sack-dollar', label: 'Refund', template: 'I would like to request a refund.' },
  { key: 'delivery', icon: 'fa-motorcycle', label: 'Delivery', template: 'I have a question about my delivery.' },
];

async function loadSupport() {
  try {
    const me = await api.get('/auth/me');
    currentUser = me.user;
  } catch (e) {
    window.location.href = 'login.html?next=support.html';
    return;
  }

  renderHeader();
  renderQuickIssues();
  await loadAttachedOrder();
  loadContactInfo();
  await loadMessages();

  document.getElementById('chat-send').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Live updates: admin replies appear instantly without refreshing.
  const socket = io();
  socket.emit('join:user', currentUser._id);
  socket.on('support:message', (msg) => {
    if (msg.user === currentUser._id || msg.user?._id === currentUser._id) {
      messages.push(msg);
      renderMessages();
      if (msg.sender === 'admin' || msg.sender === 'supplier') Sound.ping();
    }
  });
  socket.on('order:statusChanged', (updated) => {
    if (attachedOrder && updated._id === attachedOrder._id) {
      attachedOrder = updated;
      renderOrderStatusCard();
    }
  });
}

function renderHeader() {
  document.getElementById('support-header').innerHTML = `
    <div class="card support-header-card">
      <div class="support-header-avatar"><i class="fa-solid fa-headset"></i></div>
      <div class="support-header-info">
        <p class="support-header-title">Support Center</p>
        <div class="support-status"><span class="support-status-dot"></span> Online</div>
      </div>
    </div>`;
}

const ORDER_STATUS_MAP = {
  pending: { label: 'Awaiting approval', cls: 'badge-pending', icon: 'fa-clock' },
  preparing: { label: 'Preparing', cls: 'badge-pending', icon: 'fa-fire-burner' },
  confirmed: { label: 'Confirmed', cls: 'badge-approved', icon: 'fa-circle-check' },
  out_for_delivery: { label: 'Out for delivery', cls: 'badge-approved', icon: 'fa-motorcycle' },
  completed: { label: 'Delivered', cls: 'badge-approved', icon: 'fa-circle-check' },
  cancelled: { label: 'Cancelled', cls: 'badge-rejected', icon: 'fa-circle-xmark' },
};

async function loadAttachedOrder() {
  if (!attachedOrderNumber) { attachedOrder = null; renderOrderStatusCard(); return; }
  try {
    const data = await api.get(`/orders/lookup/${attachedOrderNumber}`);
    attachedOrder = data.order;
  } catch (e) {
    attachedOrder = null;
  }
  renderOrderStatusCard();
}

function renderOrderStatusCard() {
  const wrap = document.getElementById('order-status-wrap');
  if (!attachedOrder) { wrap.innerHTML = ''; return; }

  const status = ORDER_STATUS_MAP[attachedOrder.orderStatus] || ORDER_STATUS_MAP.pending;
  const firstItem = attachedOrder.items?.[0];
  const itemsLabel = attachedOrder.items?.length > 1
    ? `${firstItem?.name} + ${attachedOrder.items.length - 1} more`
    : (firstItem?.name || 'Order');

  wrap.innerHTML = `
    <div class="card order-status-card">
      <div class="order-status-thumb"><i class="fa-solid fa-receipt"></i></div>
      <div class="order-status-info">
        <p class="order-status-title">Order #${attachedOrder.orderNumber} · ${itemsLabel}</p>
        <p class="order-status-sub">${new Date(attachedOrder.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${currency(attachedOrder.totalAmount)}</p>
      </div>
      <span class="badge ${status.cls} order-status-badge"><i class="fa-solid ${status.icon}"></i> ${status.label}</span>
      <button id="clear-order-chip" class="btn btn-ghost btn-icon" aria-label="Remove" style="margin-left:4px;"><i class="fa-solid fa-xmark"></i></button>
    </div>`;

  document.getElementById('clear-order-chip').addEventListener('click', () => {
    attachedOrderNumber = null;
    attachedOrder = null;
    renderOrderStatusCard();
  });
}

function renderQuickIssues() {
  const wrap = document.getElementById('quick-issues-wrap');
  wrap.innerHTML = `
    <div class="quick-issues">
      <p class="quick-issues-label">Quick issues</p>
      <div class="quick-issue-grid">
        ${QUICK_ISSUES.map((q) => `
          <button type="button" class="quick-issue-chip ${activeQuickIssue === q.key ? 'active' : ''}" data-key="${q.key}">
            <i class="fa-solid ${q.icon}"></i>
            <span>${q.label}</span>
          </button>`).join('')}
      </div>
    </div>`;

  wrap.querySelectorAll('.quick-issue-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const q = QUICK_ISSUES.find((x) => x.key === chip.dataset.key);
      activeQuickIssue = activeQuickIssue === q.key ? null : q.key;
      renderQuickIssues();
      const input = document.getElementById('chat-input');
      if (activeQuickIssue) {
        input.value = q.template;
        input.focus();
      }
    });
  });
}

async function loadContactInfo() {
  const card = document.getElementById('contact-card');
  try {
    const data = await api.get('/contact-info');
    const c = data.contactInfo;
    card.innerHTML = `
      <div class="card contact-card">
        <p class="eyebrow" style="margin-bottom:4px;">Prefer to reach us directly?</p>
        ${c.phone ? `<div class="contact-row"><span><i class="fa-solid fa-phone"></i> Phone</span><span>${c.phone}</span></div>` : ''}
        ${c.whatsapp ? `<div class="contact-row"><span><i class="fa-brands fa-whatsapp"></i> WhatsApp</span><span>${c.whatsapp}</span></div>` : ''}
        ${c.email ? `<div class="contact-row"><span><i class="fa-solid fa-envelope"></i> Email</span><span>${c.email}</span></div>` : ''}
        ${c.hours ? `<div class="contact-row"><span><i class="fa-solid fa-clock"></i> Hours</span><span>${c.hours}</span></div>` : ''}
        ${c.address ? `<div class="contact-row"><span><i class="fa-solid fa-location-dot"></i> Address</span><span>${c.address}</span></div>` : ''}
      </div>`;
  } catch (e) {
    card.innerHTML = ''; // not set up yet - fine, chat still works
  }
}

async function loadMessages() {
  try {
    const data = await api.get('/support');
    messages = data.messages;
  } catch (e) {
    messages = [];
  }
  renderMessages();
}

function renderMessages() {
  const scroll = document.getElementById('chat-scroll');

  if (!messages.length) {
    scroll.innerHTML = `
      <div class="empty-state" style="padding:30px 20px;">
        <p class="helper-text">No messages yet. Say hello, or pick a quick issue above and we'll take a look.</p>
      </div>`;
    return;
  }

  scroll.innerHTML = messages.map((m) => {
    const mine = m.sender === 'customer';
    const time = new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const senderLabel = mine ? 'You' : (m.sender === 'supplier' ? `${m.senderName} · Rider` : m.senderName);
    return `
      <div class="chat-bubble-row ${mine ? 'mine' : ''}">
        <div class="chat-bubble">
          ${m.orderNumber ? `<span class="chat-order-tag"><i class="fa-solid fa-receipt"></i> Order #${m.orderNumber}</span><br/>` : ''}
          ${escapeHtml(m.message)}
          <span class="chat-meta">${senderLabel} · ${time}</span>
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

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const errorEl = document.getElementById('chat-error');
  const text = input.value.trim();
  if (!text) return;

  errorEl.style.display = 'none';
  input.disabled = true;

  try {
    const data = await api.post('/support', {
      message: text,
      orderNumber: attachedOrderNumber || undefined,
    });
    messages.push(data.message);
    input.value = '';
    activeQuickIssue = null;
    renderQuickIssues();
    renderMessages();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    input.disabled = false;
    input.focus();
  }
}

loadSupport();
