// Logic for a single order's live status tracking page (order.html?id=...)

const STEPS = [
  { key: 'pending', label: 'Order placed' },
  { key: 'confirmed', label: 'Payment approved' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out_for_delivery', label: 'Out for delivery' },
  { key: 'completed', label: 'Delivered' },
];

const orderId = new URLSearchParams(window.location.search).get('id');
let order = null;
let previousPaymentStatus = null;
let previousOrderStatus = null;

async function loadOrder() {
  if (!orderId) return;
  try {
    const data = await api.get(`/orders/${orderId}`);
    order = data.order;
    previousPaymentStatus = order.paymentStatus;
    previousOrderStatus = order.orderStatus;
    render();
  } catch (e) {
    document.getElementById('order-content').innerHTML = `<p class="helper-text">Could not load this order.</p>`;
  }
}

function formatEta(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMins = Math.round((d - now) / 60000);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffMins > 0) return `Around ${time} · ~${diffMins} min`;
  return `Around ${time}`;
}

function renderDeliveryBanner() {
  if (order.orderStatus === 'out_for_delivery') {
    return `
      <div class="delivery-banner">
        <div class="delivery-banner-icon"><i class="fa-solid fa-motorcycle"></i></div>
        <div>
          <p class="delivery-banner-title">Out for delivery</p>
          <p class="delivery-banner-sub">${order.estimatedDeliveryAt ? `Estimated arrival: ${formatEta(order.estimatedDeliveryAt)}` : 'Your rider is on the way.'}</p>
        </div>
      </div>`;
  }
  if (order.orderStatus === 'completed') {
    return `
      <div class="delivery-banner delivered">
        <div class="delivery-banner-icon"><i class="fa-solid fa-circle-check"></i></div>
        <div>
          <p class="delivery-banner-title">Delivered</p>
          <p class="delivery-banner-sub">${order.deliveredAt ? `Delivered at ${new Date(order.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Enjoy your meal!'}</p>
        </div>
      </div>`;
  }
  return '';
}

function render() {
  const rejected = order.paymentStatus === 'rejected';
  const currentStepIndex = rejected ? -1 : STEPS.findIndex((s) => s.key === order.orderStatus);
  const heading = rejected ? 'Payment not confirmed' : order.paymentStatus === 'approved' ? 'Order confirmed' : 'Awaiting approval';
  const wasAdjusted = order.originalTotalAmount != null && order.originalTotalAmount !== order.totalAmount;

  let body = '';
  if (rejected) {
    body = `
      <div class="card" style="padding:20px; border-color: var(--red);">
        <p style="margin:0;">${order.rejectionReason || 'We could not confirm this payment.'}</p>
        <p class="helper-text" style="margin-top:10px;">If you believe this is a mistake, message us in Support with your order number below.</p>
      </div>`;
  } else {
    body = `
      <div class="order-steps">
        ${STEPS.map((s, i) => `
          <div class="step ${i <= currentStepIndex ? 'done' : ''}">
            <span class="step-dot"></span>
            <span class="step-label">${s.label}</span>
          </div>`).join('')}
      </div>
      ${renderDeliveryBanner()}`;
  }

  document.getElementById('order-content').innerHTML = `
    <p class="eyebrow">Order #${order.orderNumber || order._id.slice(-6).toUpperCase()}</p>
    <h1 class="display" style="margin-bottom:20px;">${heading}</h1>
    ${body}
    ${order.notes ? `
      <div class="card" style="padding:14px 16px; margin-top:16px;">
        <p class="helper-text" style="margin:0 0 4px;">Your note to us</p>
        <p style="margin:0; font-size:14px;">${order.notes}</p>
      </div>` : ''}
    <div class="card" style="padding:16px; margin-top:16px;">
      ${order.items.map((i) => `
        <div style="padding:6px 0;">
          <div style="display:flex; justify-content:space-between;">
            <span>${i.quantity} × ${i.name}</span>
            <span style="font-family:var(--font-mono);">${currency(i.price * i.quantity)}</span>
          </div>
          ${i.extras?.length ? `
            <div class="helper-text" style="font-size:11.5px; margin-top:2px;">
              ${i.extras.map((e) => `+ ${e.quantity} × ${e.name} (${currency(e.price * e.quantity)})`).join(', ')}
            </div>` : ''}
        </div>`).join('')}
      <div class="ticket-tear"></div>
      ${wasAdjusted ? `
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
          <span class="helper-text">Original total</span>
          <span class="helper-text" style="font-family:var(--font-mono); text-decoration:line-through;">${currency(order.originalTotalAmount)}</span>
        </div>` : ''}
      <div class="cart-total"><span>Total</span><span class="price">${currency(order.totalAmount)}</span></div>
      ${wasAdjusted ? `<p class="helper-text" style="margin-top:8px;">${order.priceAdjustmentReason ? `Updated because: ${order.priceAdjustmentReason}` : 'This total was updated by the restaurant.'}</p>` : ''}
    </div>
    <a href="support.html?order=${encodeURIComponent(order.orderNumber || '')}" class="btn btn-ghost btn-block" style="margin-top:16px;"><i class="fa-regular fa-comment-dots"></i> Have an issue? Message support</a>
  `;
}

// Live updates: as soon as the admin approves/rejects, or the delivery
// status changes, this page updates itself — and plays the right tone.
const socket = io();
api.get('/auth/me').then((me) => socket.emit('join:user', me.user._id)).catch(() => {});
socket.on('order:statusChanged', (updated) => {
  if (updated._id === orderId) {
    if (previousPaymentStatus !== 'approved' && updated.paymentStatus === 'approved') {
      Sound.orderApproved();
      UI.toast('Your payment was approved!', { type: 'success' });
    }
    if (previousOrderStatus !== 'completed' && updated.orderStatus === 'completed') {
      Sound.delivered();
      UI.toast('Your order has been delivered. Enjoy!', { type: 'success' });
    }
    previousPaymentStatus = updated.paymentStatus;
    previousOrderStatus = updated.orderStatus;
    order = updated;
    render();
  }
});

loadOrder();
