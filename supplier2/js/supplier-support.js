// Logic for the rider-facing support chat page (supplier/support.html).
// Deliberately a slimmer version of public/js/support-page.js — no quick
// issues, order-attach chip, or contact card, since a rider's own account
// questions to admin don't need those; per-order delivery problems still go
// through reportIssue() in supplier-orders.js (which posts to the
// CUSTOMER's thread, not this one).

let currentUser = null;
let messages = [];

async function loadSupplierSupport() {
  currentUser = await requireSupplier();
  if (!currentUser) return;

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
      if (msg.sender === 'admin') Sound.ping();
    }
  });
}

async function loadMessages() {
  try {
    const data = await api.get('/supplier/support');
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
        <p class="helper-text">No messages yet. Say hello — the restaurant will see it here.</p>
      </div>`;
    return;
  }

  scroll.innerHTML = messages.map((m) => {
    const mine = m.sender === 'supplier';
    const time = new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const senderLabel = mine ? 'You' : m.senderName;
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
    const data = await api.post('/supplier/support', { message: text });
    messages.push(data.message);
    input.value = '';
    renderMessages();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    input.disabled = false;
    input.focus();
  }
}

loadSupplierSupport();
