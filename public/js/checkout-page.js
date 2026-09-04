// Logic for the checkout page - shows the bank account to pay into,
// then submits the order as "awaiting approval".

let cart = { items: [] };
let paymentInfo = null;

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
    const data = await api.get('/payment-info');
    paymentInfo = data.paymentInfo;
  } catch (e) { paymentInfo = null; }

  renderCheckout();
}

function lineTotal(line) {
  const base = (line.menuItem?.currentPrice ?? line.priceAtAdd) * line.quantity;
  const extras = (line.extras || []).reduce((s, e) => s + e.price * e.quantity, 0);
  return base + extras;
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

    <div class="card" style="padding:20px; margin-bottom:20px;">
      <p class="eyebrow" style="margin-bottom:10px;">Pay by bank transfer</p>
      ${paymentInfo ? `
        <p style="margin:4px 0;">${paymentInfo.bankName}</p>
        <div class="account-row">
          <span class="account-number">${paymentInfo.accountNumber}</span>
          <button class="btn btn-ghost btn-sm" id="copy-btn"><i class="fa-regular fa-copy"></i> Copy</button>
        </div>
        <p style="margin:4px 0 12px;">${paymentInfo.accountName}</p>
        <div class="ticket-tear"></div>
        <p class="helper-text">${paymentInfo.instructions}</p>
      ` : `<p class="helper-text">Bank details aren't set up yet — contact the restaurant directly.</p>`}
    </div>

    <div class="field">
      <label for="address">Delivery / pickup details</label>
      <textarea id="address" rows="2" placeholder="Address, or 'Pickup' if collecting in person"></textarea>
    </div>

    <div class="field">
      <label for="note">Transfer reference (recommended)</label>
      <input id="note" placeholder="Name it was sent under, or your bank's reference" />
      <span class="helper-text">This helps us match your payment faster.</span>
    </div>

    <div class="field">
      <label for="description">Anything else we should know? (optional)</label>
      <textarea id="description" rows="2" placeholder="e.g. no onions please, extra spicy…"></textarea>
      <span class="helper-text">If your request changes the price, we'll update your total and let you know in Support chat before preparing it.</span>
    </div>

    <div class="ticket-tear"></div>

    <div class="cart-total" style="margin-bottom:16px;">
      <span>Total due</span>
      <span class="price" style="font-size:20px;">${currency(total)}</span>
    </div>

    <p class="error-text" id="error-text" style="display:none;"></p>

    <button class="btn btn-primary btn-block" id="submit-btn">I've sent the transfer — submit order</button>
    <p class="helper-text" style="margin-top:10px; text-align:center;">
      Your order stays "awaiting approval" until we confirm the payment.
    </p>
  `;

  if (paymentInfo) {
    document.getElementById('copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(paymentInfo.accountNumber);
      const btn = document.getElementById('copy-btn');
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      UI.toast('Account number copied', { type: 'success' });
      setTimeout(() => { btn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy'; }, 1500);
    });
  }

  document.getElementById('submit-btn').addEventListener('click', placeOrder);
}

async function placeOrder() {
  const btn = document.getElementById('submit-btn');
  const errorText = document.getElementById('error-text');
  errorText.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Submitting order…';

  try {
    const data = await api.post('/orders', {
      deliveryAddress: document.getElementById('address').value,
      paymentReference: document.getElementById('note').value,
      paymentMethod: 'bank_transfer',
      notes: document.getElementById('description').value,
    });
    Sound.orderPlaced();
    await UI.alert('Your order has been submitted and is awaiting payment approval. We\'ll notify you as soon as it\'s confirmed.', {
      title: 'Order placed',
      kind: 'success',
    });
    window.location.href = `order.html?id=${data.order._id}`;
  } catch (err) {
    errorText.textContent = err.message;
    errorText.style.display = 'block';
    btn.disabled = false;
    btn.textContent = "I've sent the transfer — submit order";
  }
}

loadCheckout();
