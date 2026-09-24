// Logic for the checkout page. No account number and no address textarea
// here anymore — the customer picks a saved address (managed on the
// Addresses page) and, if delivery works out close by (IN_HOUSE), can
// choose to pay after delivery instead of by bank transfer. Either way,
// nothing payment-related is shown until an admin has reviewed and
// stamped the order (see order.html for that next stage).

let cart = { items: [] };
let addresses = [];
let selectedAddressId = null;
let paymentMethod = 'bank_transfer';
let customerLocation = null; // { lat, lng } from HTML5 Geolocation, captured at checkout
let deliveryQuote = null; // { mode, fee, etaMinutes, distanceKm } from POST /delivery/quote
let deliveryState = 'idle'; // 'idle' | 'locating' | 'quoting' | 'ready' | 'error'
let deliveryError = null;

let appliedCoupon = null; // { code, discount } once a promo code has been validated
let couponState = 'idle'; // 'idle' | 'checking' | 'error'
let couponError = null;

async function loadCheckout() {
  try {
    await api.get('/auth/me');
  } catch (e) {
    window.location.href = 'login.html?next=checkout.html';
    return;
  }

  try {
    const data = await api.get('/cart');
    cart = data.cart;
  } catch (e) { cart = { items: [] }; }

  try {
    const data = await api.get('/auth/addresses');
    addresses = data.addresses || [];
    const def = addresses.find((a) => a.isDefault) || addresses[0];
    selectedAddressId = def ? def._id : null;
  } catch (e) { addresses = []; }

  renderCheckout();
  detectLocationAndQuote(); // fires the browser's location permission prompt right at checkout, per spec
}

function lineTotal(line) {
  const base = (line.menuItem?.currentPrice ?? line.priceAtAdd) * line.quantity;
  const extras = (line.extras || []).reduce((s, e) => s + e.price * e.quantity, 0);
  return base + extras;
}

function foodSubtotal() {
  return cart.items.reduce((sum, line) => sum + lineTotal(line), 0);
}

function renderCheckout() {
  const container = document.getElementById('checkout-content');

  if (!cart.items?.length) {
    container.innerHTML = `<div class="empty-state"><h2 class="display">Nothing to check out</h2><p class="helper-text">Your cart is empty.</p></div>`;
    return;
  }

  const total = cart.items.reduce((sum, line) => sum + lineTotal(line), 0);

  container.innerHTML = `
    <div class="card" style="padding:16px; margin-bottom:20px;">
      <p class="eyebrow" style="margin-bottom:10px;">Order summary</p>
      ${cart.items.map((line) => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; font-size:14px;">
          <span>${line.quantity} × ${line.menuItem?.name || 'Item'}${line.extras?.length ? `<br><span class="helper-text" style="font-size:11.5px;">${line.extras.map((e) => `+ ${e.quantity} × ${e.name}`).join(', ')}</span>` : ''}</span>
          <span style="font-family:var(--font-mono);">${currency(lineTotal(line))}</span>
        </div>
      `).join('')}
    </div>

    <div class="card" style="padding:16px; margin-bottom:20px;" id="coupon-wrap"></div>

    <div class="card" style="padding:16px; margin-bottom:20px;">
      <p class="eyebrow" style="margin-bottom:10px;">Delivery address <span class="error-text" style="font-size:12px;">*required</span></p>
      <div id="address-picker"></div>
    </div>

    <div class="card" style="padding:16px; margin-bottom:20px;" id="delivery-wrap"></div>

    <div class="card" style="padding:16px; margin-bottom:20px;" id="payment-method-wrap"></div>

    <div class="field">
      <label for="description">Anything else we should know? (optional)</label>
      <textarea id="description" rows="2" placeholder="e.g. no onions please, extra spicy…"></textarea>
      <span class="helper-text">If your request changes the price, we'll update your total and let you know once we review your order.</span>
    </div>

    <div class="ticket-tear"></div>

    <div id="totals-breakdown"></div>
    <div class="cart-total" style="margin-bottom:16px;" id="total-row">
      <span>Total due</span>
      <span class="price" style="font-size:20px;" id="total-display">${currency(total)}</span>
    </div>

    <p class="error-text" id="error-text" style="display:none;"></p>

    <button class="btn btn-primary btn-block" id="submit-btn">Submit order for review</button>
    <p class="helper-text" style="margin-top:10px; text-align:center;">
      We'll review your order first — you'll see payment details (or your "pay on delivery" confirmation) as soon as it's approved.
    </p>
  `;

  renderCouponCard();
  renderAddressPicker();
  renderDeliveryCard(); // separate function so re-runs (after locating/quoting) don't wipe the form above
  renderPaymentMethod();
  updateTotalDisplay();

  document.getElementById('submit-btn').addEventListener('click', placeOrder);
}

function discountAmount() {
  return appliedCoupon ? appliedCoupon.discount : 0;
}

function renderCouponCard() {
  const wrap = document.getElementById('coupon-wrap');
  if (!wrap) return;

  if (appliedCoupon) {
    wrap.innerHTML = `
      <p class="eyebrow" style="margin-bottom:10px;">Promo code</p>
      <div class="coupon-applied">
        <span><span class="coupon-code-label">${escapeHtmlLocal(appliedCoupon.code)}</span> applied — ${currency(appliedCoupon.discount)} off</span>
        <button type="button" class="coupon-remove-btn" id="coupon-remove-btn">Remove</button>
      </div>
    `;
    document.getElementById('coupon-remove-btn').addEventListener('click', () => {
      appliedCoupon = null;
      couponState = 'idle';
      couponError = null;
      renderCouponCard();
      updateTotalDisplay();
    });
    return;
  }

  wrap.innerHTML = `
    <p class="eyebrow" style="margin-bottom:10px;">Promo code</p>
    <div class="coupon-row">
      <input type="text" id="coupon-input" placeholder="Enter code" />
      <button type="button" class="btn btn-ghost btn-sm" id="coupon-apply-btn">${couponState === 'checking' ? 'Checking…' : 'Apply'}</button>
    </div>
    ${couponError ? `<p class="error-text" style="margin-top:8px;">${couponError}</p>` : ''}
  `;

  document.getElementById('coupon-apply-btn').addEventListener('click', applyCoupon);
  document.getElementById('coupon-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyCoupon();
  });
}

async function applyCoupon() {
  const input = document.getElementById('coupon-input');
  const code = input.value.trim();
  if (!code) return;

  couponState = 'checking';
  couponError = null;
  renderCouponCard();

  try {
    const data = await api.post('/coupons/validate', { code, subtotal: foodSubtotal() });
    appliedCoupon = { code: data.coupon.code, discount: data.discount };
    couponState = 'idle';
    UI.toast(`Promo code applied — ${currency(data.discount)} off`, { type: 'success' });
  } catch (err) {
    couponState = 'error';
    couponError = err.message;
    appliedCoupon = null;
  }

  renderCouponCard();
  updateTotalDisplay();
}

function renderAddressPicker() {
  const wrap = document.getElementById('address-picker');
  if (!wrap) return;

  if (!addresses.length) {
    wrap.innerHTML = `
      <p class="helper-text" style="margin-bottom:10px;">You don't have a saved address yet.</p>
      <a class="btn btn-ghost btn-block" href="addresses.html?next=checkout.html"><i class="fa-solid fa-plus"></i> Add a delivery address</a>
    `;
    return;
  }

  wrap.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${addresses.map((a) => `
        <label class="address-choice ${selectedAddressId === a._id ? 'selected' : ''}">
          <input type="radio" name="address-choice" value="${a._id}" ${selectedAddressId === a._id ? 'checked' : ''} />
          <span class="address-choice-label">
            <strong><i class="fa-solid ${a.label === 'Work' ? 'fa-briefcase' : a.label === 'Other' ? 'fa-location-dot' : 'fa-house'}"></i> ${escapeHtmlLocal(a.label || 'Home')}</strong>
            <span class="helper-text" style="display:block;">${escapeHtmlLocal(a.address)}</span>
          </span>
        </label>
      `).join('')}
    </div>
    <a href="addresses.html?next=checkout.html" class="helper-text" style="display:inline-block; margin-top:10px; text-decoration:underline;">Manage addresses</a>
  `;

  wrap.querySelectorAll('input[name="address-choice"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      selectedAddressId = e.target.value;
      renderAddressPicker();
    });
  });
}

function renderPaymentMethod() {
  const wrap = document.getElementById('payment-method-wrap');
  if (!wrap) return;

  const isClose = deliveryState === 'ready' && deliveryQuote?.mode === 'IN_HOUSE';
  if (!isClose && paymentMethod === 'pay_on_delivery') paymentMethod = 'bank_transfer';

  wrap.innerHTML = `
    <p class="eyebrow" style="margin-bottom:10px;">How would you like to pay?</p>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <label class="address-choice ${paymentMethod === 'bank_transfer' ? 'selected' : ''}">
        <input type="radio" name="payment-choice" value="bank_transfer" ${paymentMethod === 'bank_transfer' ? 'checked' : ''} />
        <span class="address-choice-label">
          <strong><i class="fa-solid fa-building-columns"></i> Pay by bank transfer</strong>
          <span class="helper-text" style="display:block;">We'll show you the account details once your order is approved.</span>
        </span>
      </label>
      <label class="address-choice ${!isClose ? 'disabled' : ''} ${paymentMethod === 'pay_on_delivery' ? 'selected' : ''}">
        <input type="radio" name="payment-choice" value="pay_on_delivery" ${paymentMethod === 'pay_on_delivery' ? 'checked' : ''} ${!isClose ? 'disabled' : ''} />
        <span class="address-choice-label">
          <strong><i class="fa-solid fa-hand-holding-dollar"></i> Pay after delivery</strong>
          <span class="helper-text" style="display:block;">
            ${isClose
              ? 'Pay the rider when your order arrives. Still needs admin approval before it starts preparing.'
              : 'Only available for addresses close enough for our own in-house delivery.'}
          </span>
        </span>
      </label>
    </div>
  `;

  wrap.querySelectorAll('input[name="payment-choice"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      paymentMethod = e.target.value;
      renderPaymentMethod();
    });
  });
}

function renderDeliveryCard() {
  const wrap = document.getElementById('delivery-wrap');
  if (!wrap) return;

  if (deliveryState === 'locating' || deliveryState === 'quoting') {
    wrap.innerHTML = `
      <p class="eyebrow" style="margin-bottom:6px;">Delivery</p>
      <p class="helper-text"><i class="fa-solid fa-location-crosshairs fa-spin"></i>
        ${deliveryState === 'locating' ? 'Finding your location…' : 'Working out your delivery fee…'}
      </p>`;
    return;
  }

  if (deliveryState === 'error') {
    wrap.innerHTML = `
      <p class="eyebrow" style="margin-bottom:6px;">Delivery</p>
      <p class="error-text" style="margin:0 0 10px;">${deliveryError}</p>
      <button class="btn btn-ghost btn-sm" id="retry-location-btn"><i class="fa-solid fa-rotate-right"></i> Try again</button>
      <p class="helper-text" style="margin-top:8px;">
        You can still submit — we'll confirm your exact delivery fee during review. "Pay after delivery" needs a resolved location, though.
      </p>`;
    document.getElementById('retry-location-btn').addEventListener('click', detectLocationAndQuote);
    return;
  }

  if (deliveryState === 'ready' && deliveryQuote) {
    const isInHouse = deliveryQuote.mode === 'IN_HOUSE';
    wrap.innerHTML = `
      <p class="eyebrow" style="margin-bottom:6px;">Delivery</p>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <span><i class="fa-solid ${isInHouse ? 'fa-shop' : 'fa-motorcycle'}"></i>
          ${isInHouse ? 'In-house delivery (free)' : 'Chowdeck rider'}
        </span>
        <span class="price" style="font-family:var(--font-mono);">${deliveryQuote.fee > 0 ? currency(deliveryQuote.fee) : 'Free'}</span>
      </div>
      <p class="helper-text" style="margin:6px 0 0;">Estimated arrival in about ${deliveryQuote.etaMinutes} minutes · ${deliveryQuote.distanceKm} km away</p>
    `;
    return;
  }

  wrap.innerHTML = `<p class="eyebrow" style="margin-bottom:6px;">Delivery</p><p class="helper-text">Waiting for location…</p>`;
}

function updateTotalDisplay() {
  const totalEl = document.getElementById('total-display');
  if (!totalEl) return;

  const subtotal = foodSubtotal();
  const discount = discountAmount();
  const deliveryFee = deliveryQuote?.fee || 0;
  const total = Math.max(0, subtotal - discount) + deliveryFee;

  totalEl.textContent = currency(total);

  const breakdownEl = document.getElementById('totals-breakdown');
  if (breakdownEl) {
    breakdownEl.innerHTML = discount > 0 ? `
      <div style="display:flex; justify-content:space-between; padding:4px 0; font-size:13.5px;">
        <span class="helper-text">Subtotal</span><span>${currency(subtotal)}</span>
      </div>
      <div style="display:flex; justify-content:space-between; padding:4px 0 10px; font-size:13.5px;" class="discount-row">
        <span>Discount</span><span>-${currency(discount)}</span>
      </div>
    ` : '';
  }
}

async function detectLocationAndQuote() {
  deliveryState = 'locating';
  deliveryError = null;
  renderDeliveryCard();

  try {
    const loc = await Geo.getCustomerLocation();
    customerLocation = { lat: loc.lat, lng: loc.lng };

    deliveryState = 'quoting';
    renderDeliveryCard();

    const data = await api.post('/delivery/quote', {
      lat: loc.lat,
      lng: loc.lng,
      orderSubtotal: foodSubtotal(),
    });
    deliveryQuote = data.delivery;
    deliveryState = 'ready';
  } catch (err) {
    deliveryState = 'error';
    deliveryError = err.message;
    deliveryQuote = null;
  }

  renderDeliveryCard();
  renderPaymentMethod();
  updateTotalDisplay();
}

async function placeOrder() {
  const btn = document.getElementById('submit-btn');
  const errorText = document.getElementById('error-text');
  errorText.style.display = 'none';

  if (!selectedAddressId) {
    errorText.textContent = 'Please choose (or add) a delivery address.';
    errorText.style.display = 'block';
    document.getElementById('address-picker').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting order…';

  try {
    const data = await api.post('/orders', {
      addressId: selectedAddressId,
      paymentMethod,
      notes: document.getElementById('description').value,
      // Sent whenever we managed to get it — the backend recomputes the
      // authoritative mode/fee itself from these coordinates rather than
      // trusting deliveryQuote (that was only ever a preview).
      customerLocation: customerLocation || undefined,
      // Re-validated and recomputed server-side — this is never trusted
      // as the actual discount, just tells the backend which code to apply.
      couponCode: appliedCoupon?.code || undefined,
    });
    Sound.orderPlaced();
    await UI.alert("Your order has been submitted and is awaiting review. We'll notify you as soon as it's approved.", {
      title: 'Order placed',
      kind: 'success',
    });
    window.location.href = `order.html?id=${data.order._id}`;
  } catch (err) {
    errorText.textContent = err.message;
    errorText.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Submit order for review';
  }
}

function escapeHtmlLocal(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadCheckout();
