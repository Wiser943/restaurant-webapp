// Logic for a single order's live status tracking page (order.html?id=...)

const orderId = new URLSearchParams(window.location.search).get('id');
let order = null;
let paymentInfo = null;
let previousOrderStatus = null;
let previousPaymentStatus = null;

function stepsFor(o) {
  if (o.paymentMethod === 'pay_on_delivery') {
    return [
      { key: 'pending', label: 'Order placed' },
      { key: 'preparing', label: 'Preparing' },
      { key: 'out_for_delivery', label: 'Out for delivery' },
      { key: 'completed', label: 'Delivered' },
    ];
  }
  return [
    { key: 'pending', label: 'Order placed' },
    { key: 'awaiting_payment', label: 'Payment' },
    { key: 'preparing', label: 'Preparing' },
    { key: 'out_for_delivery', label: 'Out for delivery' },
    { key: 'completed', label: 'Delivered' },
  ];
}

async function loadOrder() {
  if (!orderId) return;
  try {
    const data = await api.get(`/orders/${orderId}`);
    order = data.order;
    previousOrderStatus = order.orderStatus;
    previousPaymentStatus = order.paymentStatus;
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
  const cd = order.delivery?.chowdeck;
  if (cd?.friendlyStatus && order.orderStatus !== 'completed') {
    return `
      <div class="delivery-banner">
        <div class="delivery-banner-icon"><i class="fa-solid fa-motorcycle"></i></div>
        <div>
          <p class="delivery-banner-title">${cd.friendlyStatus}</p>
          <p class="delivery-banner-sub">
            ${cd.riderName ? `${cd.riderName}${cd.riderPhone ? ` · ${cd.riderPhone}` : ''}` : 'Chowdeck Relay'}
            ${order.delivery?.etaMinutes ? ` · ~${order.delivery.etaMinutes} min` : ''}
          </p>
          ${cd.trackingUrl ? `<a href="${cd.trackingUrl}" target="_blank" rel="noopener" class="helper-text" style="text-decoration:underline;">Track rider live →</a>` : ''}
        </div>
      </div>`;
  }

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
  if (order.delivery?.mode && ['pending', 'awaiting_payment', 'preparing'].includes(order.orderStatus)) {
    const isInHouse = order.delivery.mode === 'IN_HOUSE';
    return `
      <div class="delivery-banner">
        <div class="delivery-banner-icon"><i class="fa-solid ${isInHouse ? 'fa-shop' : 'fa-motorcycle'}"></i></div>
        <div>
          <p class="delivery-banner-title">${isInHouse ? 'In-house delivery' : 'Chowdeck Relay'}</p>
          <p class="delivery-banner-sub">
            ${isInHouse ? 'Free — our own rider will bring it over.' : `${currency(order.delivery.fee)} delivery fee`}
            ${order.delivery.etaMinutes ? ` · ~${order.delivery.etaMinutes} min` : ''}
          </p>
        </div>
      </div>`;
  }
  return '';
}

// The card shown between "order placed" and "preparing" — differs a lot
// depending on where the order is in the review/payment pipeline.
function renderStatusCard() {
  const wasAdjusted = order.originalTotalAmount != null && order.originalTotalAmount !== order.totalAmount;
  const adjustedNote = wasAdjusted
    ? `<p class="helper-text" style="margin-top:8px;">${order.priceAdjustmentReason ? `Your total was updated because: ${order.priceAdjustmentReason}` : 'Your total was updated by the restaurant.'}</p>`
    : '';

  if (order.reviewStatus === 'pending') {
    return `
      <div class="card" style="padding:20px;">
        <p style="margin:0;"><i class="fa-regular fa-clock"></i> We're reviewing your order — this usually takes just a few minutes.</p>
        ${adjustedNote}
      </div>`;
  }

  if (order.reviewStatus === 'rejected') {
    return `
      <div class="card" style="padding:20px; border-color: var(--red);">
        <p style="margin:0;">${order.rejectionReason || 'We could not accept this order.'}</p>
        <p class="helper-text" style="margin-top:10px;">If you believe this is a mistake, message us in Support with your order number below.</p>
      </div>`;
  }

  // reviewStatus === 'approved' from here on
  if (order.paymentMethod === 'pay_on_delivery') {
    return `
      <div class="card" style="padding:20px; border-color: var(--sage);">
        <p style="margin:0;"><i class="fa-solid fa-circle-check" style="color:var(--sage);"></i> Approved — pay the rider when your order arrives.</p>
        ${adjustedNote}
      </div>`;
  }

  if (order.paymentStatus === 'awaiting_payment') {
    return renderPaymentCard();
  }
  if (order.paymentStatus === 'proof_submitted') {
    return `
      <div class="card" style="padding:20px;">
        <p style="margin:0;"><i class="fa-regular fa-clock"></i> Thanks — we're confirming your payment now.</p>
        ${order.paymentProofUrl ? `<img src="${order.paymentProofUrl}" alt="Your uploaded proof" style="width:100%; border-radius:12px; margin-top:12px;" />` : ''}
        ${adjustedNote}
      </div>`;
  }
  if (order.paymentStatus === 'rejected') {
    return `
      <div class="card" style="padding:20px; border-color: var(--red); margin-bottom:16px;">
        <p style="margin:0;">${order.rejectionReason || 'We could not confirm your payment.'}</p>
      </div>
      ${renderPaymentCard()}`;
  }
  // paymentStatus === 'approved' -> normal steps tracker takes over below
  return '';
}

function renderPaymentCard() {
  return `
    <div class="card" style="padding:20px;">
      <p class="eyebrow" style="margin-bottom:10px;"><i class="fa-solid fa-circle-check" style="color:var(--sage);"></i> Approved — pay by bank transfer</p>
      <div id="payment-info-slot"><p class="helper-text">Loading account details…</p></div>
      <div class="ticket-tear"></div>
      <div class="field">
        <label for="proof-file">Upload transaction screenshot (optional)</label>
        <input type="file" id="proof-file" accept="image/*" />
        <span class="helper-text" id="proof-status"></span>
      </div>
      <button class="btn btn-primary btn-block" id="paid-btn"><i class="fa-solid fa-paper-plane"></i> I've sent the transfer</button>
    </div>`;
}

async function wirePaymentCard() {
  const slot = document.getElementById('payment-info-slot');
  const paidBtn = document.getElementById('paid-btn');
  if (!slot || !paidBtn) return;

  if (!paymentInfo) {
    try { paymentInfo = (await api.get('/payment-info')).paymentInfo; } catch (e) { paymentInfo = null; }
  }

  slot.innerHTML = paymentInfo ? `
    <p style="margin:4px 0;">${paymentInfo.bankName}</p>
    <div class="account-row">
      <span class="account-number">${paymentInfo.accountNumber}</span>
      <button class="btn btn-ghost btn-sm" id="copy-btn"><i class="fa-regular fa-copy"></i> Copy</button>
    </div>
    <p style="margin:4px 0 12px;">${paymentInfo.accountName}</p>
    <p class="helper-text">${paymentInfo.instructions || ''}</p>
  ` : `<p class="helper-text">Bank details aren't set up yet — contact the restaurant directly.</p>`;

  const copyBtn = document.getElementById('copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(paymentInfo.accountNumber);
      UI.toast('Account number copied', { type: 'success' });
    });
  }

  let uploadedUrl = null;
  const fileInput = document.getElementById('proof-file');
  const statusEl = document.getElementById('proof-status');
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    statusEl.textContent = 'Uploading…';
    try {
      uploadedUrl = await Imgbb.upload(file);
      statusEl.textContent = 'Screenshot ready to submit.';
    } catch (err) {
      uploadedUrl = null;
      statusEl.textContent = err.message + ' (You can still submit without it.)';
    }
  });

  paidBtn.addEventListener('click', async () => {
    paidBtn.disabled = true;
    paidBtn.textContent = 'Submitting…';
    try {
      const data = await api.post(`/orders/${order._id}/payment-proof`, { screenshotUrl: uploadedUrl || undefined });
      order = data.order;
      UI.toast("Thanks — we'll confirm your payment shortly.", { type: 'success' });
      render();
    } catch (err) {
      UI.toast(err.message, { type: 'danger' });
      paidBtn.disabled = false;
      paidBtn.textContent = "I've sent the transfer";
    }
  });
}

function render() {
  const steps = stepsFor(order);
  const showTracker = order.reviewStatus === 'approved'
    && (order.paymentMethod === 'pay_on_delivery' || order.paymentStatus === 'approved');
  const currentStepIndex = showTracker ? steps.findIndex((s) => s.key === order.orderStatus) : -1;

  let heading = 'Awaiting review';
  if (order.reviewStatus === 'rejected') heading = 'Order not accepted';
  else if (order.reviewStatus === 'approved' && order.paymentMethod === 'pay_on_delivery') heading = 'Order confirmed';
  else if (order.reviewStatus === 'approved' && order.paymentStatus === 'awaiting_payment') heading = 'Approved — please pay';
  else if (order.paymentStatus === 'proof_submitted') heading = 'Confirming your payment';
  else if (order.paymentStatus === 'rejected') heading = 'Payment not confirmed';
  else if (order.paymentStatus === 'approved') heading = 'Order confirmed';

  document.getElementById('order-content').innerHTML = `
    <p class="eyebrow">Order #${order.orderNumber || order._id.slice(-6).toUpperCase()}</p>
    <h1 class="display" style="margin-bottom:20px;">${heading}</h1>

    ${showTracker ? `
      <div class="order-steps">
        ${steps.map((s, i) => `
          <div class="step ${i <= currentStepIndex ? 'done' : ''}">
            <span class="step-dot"></span>
            <span class="step-label">${s.label}</span>
          </div>`).join('')}
      </div>
      ${renderDeliveryBanner()}
    ` : renderStatusCard()}

    ${order.notes ? `
      <div class="card" style="padding:14px 16px; margin-top:16px;">
        <p class="helper-text" style="margin:0 0 4px;">Your note to us</p>
        <p style="margin:0; font-size:14px;">${order.notes}</p>
      </div>` : ''}
    <div class="card" style="padding:16px; margin-top:16px;">
      <p class="helper-text" style="margin:0 0 8px;"><i class="fa-solid fa-location-dot"></i> ${order.deliveryAddress || ''}</p>
      ${order.paymentMethod === 'pay_on_delivery' ? `<p class="helper-text" style="margin:0 0 8px;"><i class="fa-solid fa-hand-holding-dollar"></i> Pay on delivery</p>` : ''}
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
      ${order.originalTotalAmount != null && order.originalTotalAmount !== order.totalAmount ? `
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
          <span class="helper-text">Original total</span>
          <span class="helper-text" style="font-family:var(--font-mono); text-decoration:line-through;">${currency(order.originalTotalAmount)}</span>
        </div>` : ''}
      <div class="cart-total"><span>Total</span><span class="price">${currency(order.totalAmount)}</span></div>
    </div>
    <a href="support.html?order=${encodeURIComponent(order.orderNumber || '')}" class="btn btn-ghost btn-block" style="margin-top:16px;"><i class="fa-regular fa-comment-dots"></i> Have an issue? Message support</a>
  `;

  if (!showTracker && order.reviewStatus === 'approved' && order.paymentMethod === 'bank_transfer'
      && (order.paymentStatus === 'awaiting_payment' || order.paymentStatus === 'rejected')) {
    wirePaymentCard();
  }
}

// Live updates: as soon as the admin approves/rejects/adjusts, or the
// delivery status changes, this page updates itself — and plays the right tone.
const socket = io();
api.get('/auth/me').then((me) => socket.emit('join:user', me.user._id)).catch(() => {});
socket.on('order:statusChanged', (updated) => {
  if (updated._id === orderId) {
    if (previousOrderStatus !== 'preparing' && updated.orderStatus === 'preparing') {
      Sound.orderApproved();
      UI.toast('Your order is being prepared!', { type: 'success' });
    } else if (previousPaymentStatus !== 'awaiting_payment' && updated.paymentStatus === 'awaiting_payment') {
      Sound.orderApproved();
      UI.toast('Your order was approved — you can pay now.', { type: 'success' });
    }
    if (previousOrderStatus !== 'completed' && updated.orderStatus === 'completed') {
      Sound.delivered();
      UI.toast('Your order has been delivered. Enjoy!', { type: 'success' });
    }
    previousOrderStatus = updated.orderStatus;
    previousPaymentStatus = updated.paymentStatus;
    order = updated;
    render();
  }
});

loadOrder();
