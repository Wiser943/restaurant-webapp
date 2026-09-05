// Logic for the admin orders/payment-approval page

let currentFilter = 'pending';
let searchTerm = '';
let searchDebounce = null;
let suppliers = [];

async function loadOrders() {
  const admin = await requireAdmin();
  if (!admin) return;

  document.getElementById('filter-select').value = currentFilter;
  document.getElementById('filter-select').addEventListener('change', (e) => {
    currentFilter = e.target.value;
    fetchAndRender();
  });

  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      searchTerm = e.target.value.trim();
      fetchAndRender();
    }, 300);
  });

  api.get('/admin/suppliers').then((d) => { suppliers = d.suppliers; }).catch(() => {});
  fetchAndRender();

  // Live: new orders + status changes appear instantly without refreshing
  const socket = io();
  socket.emit('join:admin');
  socket.on('order:new', () => { Sound.newOrder(); UI.toast('New order received', { type: 'success' }); fetchAndRender(); });
  socket.on('order:updated', () => fetchAndRender());
}

const DELIVERY_LABEL = {
  pending: null,
  confirmed: null,
  preparing: { label: 'Preparing', icon: 'fa-fire-burner', cls: 'badge-pending' },
  out_for_delivery: { label: 'Out for delivery', icon: 'fa-motorcycle', cls: 'badge-approved' },
  completed: { label: 'Delivered', icon: 'fa-circle-check', cls: 'badge-approved' },
  cancelled: { label: 'Cancelled', icon: 'fa-circle-xmark', cls: 'badge-rejected' },
};

async function fetchAndRender() {
  const list = document.getElementById('orders-list');
  list.innerHTML = `<p class="helper-text">Loading…</p>`;

  const params = new URLSearchParams();
  if (currentFilter) params.set('paymentStatus', currentFilter);
  if (searchTerm) params.set('orderNumber', searchTerm);

  const data = await api.get(`/admin/orders?${params.toString()}`);
  const orders = data.orders;

  if (!orders.length) {
    list.innerHTML = `<div class="empty-state"><p class="helper-text">No orders here.</p></div>`;
    return;
  }

  list.innerHTML = orders.map((o) => {
    const wasAdjusted = o.originalTotalAmount != null && o.originalTotalAmount !== o.totalAmount;
    const delivery = DELIVERY_LABEL[o.orderStatus];
    return `
    <div class="card" style="padding:16px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <p style="margin:0 0 4px; font-weight:600; font-family:var(--font-mono); font-size:13px;">${o.orderNumber || ('#' + o._id.slice(-6).toUpperCase())}</p>
          <p class="helper-text" style="margin:0;">${o.user?.name || 'Customer'} · ${o.user?.phone || o.user?.email || ''}</p>
          <p class="helper-text" style="margin:0;">${new Date(o.createdAt).toLocaleString()}</p>
        </div>
        <div style="text-align:right;">
          <span class="price" style="font-family:var(--font-mono); color:var(--orange-soft);">${currency(o.totalAmount)}</span>
          ${wasAdjusted ? `<div class="helper-text" style="text-decoration:line-through; font-size:11px;">${currency(o.originalTotalAmount)}</div>` : ''}
        </div>
      </div>

      <div class="ticket-tear"></div>

      <div style="font-size:13px; color:var(--ink-muted); margin-bottom:10px;">
        ${o.items.map((i) => `${i.quantity} × ${i.name}${i.extras?.length ? ` <span style="opacity:.7;">(${i.extras.map((e) => `+${e.quantity} ${e.name}`).join(', ')})</span>` : ''}`).join(', ')}
      </div>

      ${o.notes ? `<p style="font-size:13px; margin:0 0 10px; padding:8px 10px; background:rgba(255,138,61,0.08); border-radius:8px;"><strong>Customer note:</strong> ${o.notes}</p>` : ''}
      ${o.paymentReference ? `<p style="font-size:13px; margin:0 0 10px;"><strong>Transfer ref:</strong> ${o.paymentReference}</p>` : ''}
      ${o.deliveryAddress ? `<p style="font-size:13px; margin:0 0 10px;"><strong>Delivery:</strong> ${o.deliveryAddress}</p>` : ''}
      ${wasAdjusted && o.priceAdjustmentReason ? `<p class="helper-text" style="font-size:12px; margin:0 0 10px;">Adjusted because: ${o.priceAdjustmentReason}</p>` : ''}
      ${o.assignedSupplierName ? `<p class="helper-text" style="font-size:12px; margin:0 0 10px;"><i class="fa-solid fa-motorcycle"></i> Rider: ${o.assignedSupplierName}</p>` : ''}

      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        ${o.paymentStatus === 'pending' ? `
          <button class="btn btn-primary btn-sm approve-btn" data-id="${o._id}"><i class="fa-solid fa-check"></i> Approve payment</button>
          <button class="btn btn-danger btn-sm reject-btn" data-id="${o._id}"><i class="fa-solid fa-xmark"></i> Reject</button>
        ` : `<span class="badge ${o.paymentStatus === 'approved' ? 'badge-approved' : 'badge-rejected'}">${o.paymentStatus}</span>`}
        ${delivery ? `<span class="badge ${delivery.cls}"><i class="fa-solid ${delivery.icon}"></i> ${delivery.label}</span>` : ''}
        <button class="btn btn-ghost btn-sm adjust-btn" data-id="${o._id}" data-total="${o.totalAmount}"><i class="fa-solid fa-pen"></i> Adjust price</button>
        ${o.paymentStatus === 'approved' && !o.assignedSupplier ? `<button class="btn btn-ghost btn-sm assign-btn" data-id="${o._id}"><i class="fa-solid fa-motorcycle"></i> Assign rider</button>` : ''}
        ${o.assignedSupplier && o.orderStatus === 'preparing' ? `<button class="btn btn-ghost btn-sm dispatch-btn" data-id="${o._id}"><i class="fa-solid fa-truck-fast"></i> Dispatch</button>` : ''}
        <a class="btn btn-ghost btn-sm" href="support.html?userId=${o.user?._id || ''}"><i class="fa-regular fa-comment-dots"></i> Message customer</a>
      </div>
    </div>
  `;
  }).join('');

  list.querySelectorAll('.approve-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await api.patch(`/admin/orders/${btn.dataset.id}/approve`, {});
      Sound.orderApproved();
      UI.toast('Payment approved — customer notified', { type: 'success' });
      fetchAndRender();
    });
  });

  list.querySelectorAll('.reject-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reason = await UI.prompt('Reason for rejecting this order (optional):', { title: 'Reject order', confirmText: 'Reject' });
      if (reason === null) return;
      btn.disabled = true;
      await api.patch(`/admin/orders/${btn.dataset.id}/reject`, { reason });
      UI.toast('Order rejected', { type: 'danger' });
      fetchAndRender();
    });
  });

  list.querySelectorAll('.adjust-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const currentTotal = btn.dataset.total;
      const newTotal = await UI.prompt(`New total for this order (was ${currency(Number(currentTotal))}):`, { title: 'Adjust price', defaultValue: currentTotal, confirmText: 'Save' });
      if (newTotal === null) return;
      if (isNaN(Number(newTotal)) || Number(newTotal) < 0) { await UI.alert('Enter a valid amount.', { kind: 'danger' }); return; }
      const reason = await UI.prompt("Reason for the change (shown to the customer, e.g. 'added extra portion of meat'):", { title: 'Reason' }) || '';
      btn.disabled = true;
      await api.patch(`/admin/orders/${btn.dataset.id}/adjust-price`, { newTotal: Number(newTotal), reason });
      fetchAndRender();
    });
  });

  list.querySelectorAll('.assign-btn').forEach((btn) => {
    btn.addEventListener('click', () => assignRiderFlow(btn.dataset.id));
  });

  list.querySelectorAll('.dispatch-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const eta = await UI.prompt('Estimated delivery time, in minutes:', { title: 'Dispatch order', defaultValue: '30', confirmText: 'Start delivery' });
      if (eta === null) return;
      await api.patch(`/admin/orders/${btn.dataset.id}/dispatch`, { etaMinutes: Number(eta) || 30 });
      UI.toast('Order dispatched — customer notified', { type: 'success' });
      fetchAndRender();
    });
  });
}

async function assignRiderFlow(orderId) {
  if (!suppliers.length) {
    await UI.alert('No delivery riders yet. Add one from Settings → Delivery staff.', { title: 'No riders available' });
    return;
  }
  if (suppliers.length === 1) {
    await api.patch(`/admin/orders/${orderId}/assign`, { supplierId: suppliers[0]._id });
    UI.toast(`Assigned to ${suppliers[0].name}`, { type: 'success' });
    fetchAndRender();
    return;
  }
  // Multiple riders - ask which one via a small pick-list built on the modal.
  const overlay = document.createElement('div');
  overlay.className = 'ui-modal-overlay';
  overlay.innerHTML = `
    <div class="ui-modal glass-strong" role="dialog" aria-modal="true">
      <div class="ui-modal-icon"><i class="fa-solid fa-motorcycle"></i></div>
      <h3 class="ui-modal-title">Assign a rider</h3>
      <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
        ${suppliers.map((s) => `<button class="btn btn-ghost rider-pick" data-id="${s._id}">${s.name}</button>`).join('')}
      </div>
      <button class="btn btn-ghost btn-block cancel-pick">Cancel</button>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll('.rider-pick').forEach((b) => {
    b.addEventListener('click', async () => {
      overlay.remove();
      await api.patch(`/admin/orders/${orderId}/assign`, { supplierId: b.dataset.id });
      UI.toast('Rider assigned', { type: 'success' });
      fetchAndRender();
    });
  });
  overlay.querySelector('.cancel-pick').addEventListener('click', () => overlay.remove());
}

loadOrders();
