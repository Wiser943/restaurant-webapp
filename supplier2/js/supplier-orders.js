// Logic for the rider's "my deliveries" page

let orders = [];
let activeTab = 'active';
let supplierId = null;

const TABS = [
  { key: 'active', label: 'To deliver' },
  { key: 'delivered', label: 'Delivered' },
];

async function loadOrders() {
  const supplier = await requireSupplier();
  if (!supplier) return;
  supplierId = supplier._id;

  renderTabs();
  await fetchAndRender();

  const socket = io();
  socket.emit('join:user', supplierId);
  socket.on('order:assigned', () => { Sound.newOrder(); UI.toast('New delivery assigned to you', { type: 'success' }); fetchAndRender(); });
  socket.on('order:statusChanged', () => fetchAndRender());
}

function renderTabs() {
  const wrap = document.getElementById('tabs');
  wrap.innerHTML = TABS.map((t) => `<button class="inbox-tab ${activeTab === t.key ? 'active' : ''}" data-key="${t.key}">${t.label}</button>`).join('');
  wrap.querySelectorAll('.inbox-tab').forEach((btn) => {
    btn.addEventListener('click', () => { activeTab = btn.dataset.key; renderTabs(); renderList(); });
  });
}

async function fetchAndRender() {
  const data = await api.get('/supplier/orders');
  orders = data.orders;
  renderList();
}

function renderList() {
  const list = document.getElementById('orders-list');
  const visible = orders.filter((o) => activeTab === 'delivered' ? o.orderStatus === 'completed' : o.orderStatus !== 'completed');

  if (!visible.length) {
    list.innerHTML = `<div class="empty-state"><p class="helper-text">Nothing here right now.</p></div>`;
    return;
  }

  list.innerHTML = visible.map((o) => `
    <div class="card" style="padding:16px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <p style="margin:0 0 4px; font-weight:600; font-family:var(--font-mono); font-size:13px;">Order #${o.orderNumber}</p>
          <p class="helper-text" style="margin:0;"><i class="fa-solid fa-user"></i> ${o.user?.name || 'Customer'} · ${o.user?.phone || ''}</p>
          ${o.deliveryAddress ? `<p class="helper-text" style="margin:0;"><i class="fa-solid fa-location-dot"></i> ${o.deliveryAddress}</p>` : ''}
        </div>
        <span class="price" style="font-family:var(--font-mono); color:var(--orange-soft);">${currency(o.totalAmount)}</span>
      </div>
      <div class="ticket-tear"></div>
      <div style="font-size:13px; color:var(--ink-muted); margin-bottom:10px;">
        ${o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        ${o.orderStatus === 'preparing' ? `<button class="btn btn-primary btn-sm start-btn" data-id="${o._id}"><i class="fa-solid fa-motorcycle"></i> Start delivery</button>` : ''}
        ${o.orderStatus === 'out_for_delivery' ? `<button class="btn btn-primary btn-sm deliver-btn" data-id="${o._id}"><i class="fa-solid fa-check"></i> Confirm delivery</button>` : ''}
        ${o.orderStatus !== 'completed' ? `<button class="btn btn-ghost btn-sm issue-btn" data-id="${o._id}"><i class="fa-solid fa-triangle-exclamation"></i> Report an issue</button>` : `<span class="badge badge-approved"><i class="fa-solid fa-circle-check"></i> Delivered</span>`}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.start-btn').forEach((btn) => btn.addEventListener('click', () => startDelivery(btn.dataset.id)));
  list.querySelectorAll('.deliver-btn').forEach((btn) => btn.addEventListener('click', () => confirmDelivery(btn.dataset.id)));
  list.querySelectorAll('.issue-btn').forEach((btn) => btn.addEventListener('click', () => reportIssue(btn.dataset.id)));
}

async function startDelivery(id) {
  await api.patch(`/supplier/orders/${id}/start`, {});
  UI.toast('Delivery started', { type: 'success' });
  fetchAndRender();
}

async function confirmDelivery(id) {
  const ok = await UI.confirm('Confirm that you have successfully delivered this order to the customer.', { title: 'Order delivered?', confirmText: 'Confirm delivery' });
  if (!ok) return;
  await api.patch(`/supplier/orders/${id}/deliver`, {});
  Sound.delivered();
  UI.toast('Marked as delivered', { type: 'success' });
  fetchAndRender();
}

async function reportIssue(id) {
  const message = await UI.prompt('Describe the issue (e.g. cannot reach customer, wrong address):', { title: 'Report an issue', confirmText: 'Send' });
  if (!message) return;
  await api.patch(`/supplier/orders/${id}/issue`, { message });
  UI.toast('Issue reported to admin', { type: 'success' });
  fetchAndRender();
}

loadOrders();
