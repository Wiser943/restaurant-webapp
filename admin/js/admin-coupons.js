// Logic for the admin coupons page: list, create, edit (toggle active), delete.

let coupons = [];

async function loadCoupons() {
  const admin = await requireAdmin();
  if (!admin) return;

  document.getElementById('new-coupon-btn').addEventListener('click', () => openCouponForm(null));
  await renderStats();
  await fetchAndRenderCoupons();
}

async function renderStats() {
  const wrap = document.getElementById('coupon-stats-wrap');
  if (!wrap) return;
  try {
    const data = await api.get('/admin/coupons/stats');
    if (!data.totals.redemptions) {
      wrap.innerHTML = `<p class="helper-text" style="margin-bottom:16px;">No promo codes have been redeemed yet.</p>`;
      return;
    }
    const top = data.byCode.slice(0, 3);
    wrap.innerHTML = `
      <div class="card" style="padding:16px; margin-bottom:16px;">
        <div style="display:flex; gap:24px; margin-bottom:${top.length ? '14px' : '0'};">
          <div><p class="helper-text" style="margin:0 0 2px;">Redemptions</p><p style="margin:0; font-family:var(--font-display); font-size:22px;">${data.totals.redemptions}</p></div>
          <div><p class="helper-text" style="margin:0 0 2px;">Total discount given</p><p style="margin:0; font-family:var(--font-display); font-size:22px;">${currency(data.totals.totalDiscount)}</p></div>
        </div>
        ${top.length ? `
          <p class="helper-text" style="margin:0 0 8px;">Top codes</p>
          ${top.map((r) => `
            <div style="display:flex; justify-content:space-between; font-size:13.5px; padding:4px 0;">
              <span style="font-family:var(--font-mono);">${r.code}</span>
              <span class="helper-text">${r.redemptions} use${r.redemptions === 1 ? '' : 's'} · ${currency(r.totalDiscount)}</span>
            </div>
          `).join('')}
        ` : ''}
      </div>
    `;
  } catch (e) {
    wrap.innerHTML = '';
  }
}

async function fetchAndRenderCoupons() {
  const list = document.getElementById('coupon-list');
  try {
    const data = await api.get('/admin/coupons');
    coupons = data.coupons;
  } catch (e) {
    list.innerHTML = `<p class="helper-text">Could not load promo codes.</p>`;
    return;
  }

  if (!coupons.length) {
    list.innerHTML = `<p class="helper-text">No promo codes yet.</p>`;
    return;
  }

  list.innerHTML = coupons.map((c) => {
    const expired = c.expiresAt && new Date(c.expiresAt) < new Date();
    const usedUp = c.usageLimit != null && c.timesUsed >= c.usageLimit;
    const statusLabel = !c.active ? 'Disabled' : expired ? 'Expired' : usedUp ? 'Used up' : 'Active';
    const statusClass = statusLabel === 'Active' ? 'badge-approved' : 'badge-rejected';
    const valueLabel = c.type === 'percent' ? `${c.value}% off` : `${currency(c.value)} off`;

    return `
      <div class="card" style="padding:14px 16px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <p style="margin:0 0 4px; font-weight:700; font-family:var(--font-mono); letter-spacing:0.03em;">${c.code}</p>
            <p class="helper-text" style="margin:0;">${valueLabel}${c.minOrderAmount ? ` · min. order ${currency(c.minOrderAmount)}` : ''}</p>
            <p class="helper-text" style="margin:4px 0 0;">Used ${c.timesUsed}${c.usageLimit != null ? ` / ${c.usageLimit}` : ''} time${c.timesUsed === 1 ? '' : 's'}${c.expiresAt ? ` · expires ${new Date(c.expiresAt).toLocaleDateString()}` : ''}</p>
          </div>
          <span class="badge ${statusClass}">${statusLabel}</span>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px;">
          <button class="btn btn-ghost btn-sm edit-coupon-btn" data-id="${c._id}">Edit</button>
          <button class="btn btn-ghost btn-sm toggle-coupon-btn" data-id="${c._id}">${c.active ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-danger btn-sm delete-coupon-btn" data-id="${c._id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.edit-coupon-btn').forEach((btn) => {
    btn.addEventListener('click', () => openCouponForm(coupons.find((c) => c._id === btn.dataset.id)));
  });
  list.querySelectorAll('.toggle-coupon-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const coupon = coupons.find((c) => c._id === btn.dataset.id);
      await api.patch(`/admin/coupons/${coupon._id}`, { active: !coupon.active });
      fetchAndRenderCoupons();
    });
  });
  list.querySelectorAll('.delete-coupon-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await UI.confirm('Delete this promo code? This cannot be undone.', { confirmText: 'Delete', danger: true });
      if (!ok) return;
      await api.del(`/admin/coupons/${btn.dataset.id}`);
      UI.toast('Promo code deleted', { type: 'success' });
      fetchAndRenderCoupons();
    });
  });
}

function openCouponForm(coupon) {
  const editingId = coupon?._id || null;
  const wrap = document.getElementById('coupon-form-wrap');

  wrap.innerHTML = `
    <div class="card" style="padding:20px; margin-bottom:20px;">
      <p class="eyebrow" style="margin-bottom:10px;">${coupon ? 'Edit code' : 'New code'}</p>
      <div class="field">
        <label>Code</label>
        <input id="cp-code" value="${coupon?.code || ''}" placeholder="e.g. WELCOME10" ${editingId ? 'disabled' : ''} style="text-transform:uppercase;" />
      </div>
      <div class="field">
        <label>Discount type</label>
        <select id="cp-type">
          <option value="percent" ${coupon?.type === 'percent' || !coupon ? 'selected' : ''}>Percentage off</option>
          <option value="fixed" ${coupon?.type === 'fixed' ? 'selected' : ''}>Fixed amount off (₦)</option>
        </select>
      </div>
      <div class="field"><label>Value (% or ₦)</label><input id="cp-value" type="number" min="0" value="${coupon?.value ?? ''}" /></div>
      <div class="field"><label>Max discount (₦, optional — caps a percentage code)</label><input id="cp-max" type="number" min="0" value="${coupon?.maxDiscount ?? ''}" /></div>
      <div class="field"><label>Minimum order amount (₦, optional)</label><input id="cp-min-order" type="number" min="0" value="${coupon?.minOrderAmount ?? ''}" /></div>
      <div class="field"><label>Total usage limit (optional)</label><input id="cp-usage-limit" type="number" min="1" value="${coupon?.usageLimit ?? ''}" /></div>
      <div class="field"><label>Per-customer limit</label><input id="cp-per-user" type="number" min="1" value="${coupon?.perUserLimit ?? 1}" /></div>
      <div class="field"><label>Expires (optional)</label><input id="cp-expires" type="date" value="${coupon?.expiresAt ? new Date(coupon.expiresAt).toISOString().slice(0, 10) : ''}" /></div>
      <div class="field"><label>Note (admin-only, optional)</label><input id="cp-description" value="${coupon?.description || ''}" placeholder="e.g. Launch week promo" /></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary" id="save-coupon-btn">Save</button>
        <button class="btn btn-ghost" id="cancel-coupon-btn">Cancel</button>
      </div>
      <p class="error-text" id="coupon-form-error" style="display:none; margin-top:10px;"></p>
    </div>
  `;

  document.getElementById('cancel-coupon-btn').addEventListener('click', () => { wrap.innerHTML = ''; });
  document.getElementById('save-coupon-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('coupon-form-error');
    errorEl.style.display = 'none';

    const payload = {
      type: document.getElementById('cp-type').value,
      value: Number(document.getElementById('cp-value').value),
      maxDiscount: document.getElementById('cp-max').value ? Number(document.getElementById('cp-max').value) : null,
      minOrderAmount: document.getElementById('cp-min-order').value ? Number(document.getElementById('cp-min-order').value) : 0,
      usageLimit: document.getElementById('cp-usage-limit').value ? Number(document.getElementById('cp-usage-limit').value) : null,
      perUserLimit: document.getElementById('cp-per-user').value ? Number(document.getElementById('cp-per-user').value) : 1,
      expiresAt: document.getElementById('cp-expires').value || null,
      description: document.getElementById('cp-description').value,
    };

    try {
      if (editingId) {
        await api.patch(`/admin/coupons/${editingId}`, payload);
      } else {
        payload.code = document.getElementById('cp-code').value;
        await api.post('/admin/coupons', payload);
      }
      wrap.innerHTML = '';
      UI.toast('Promo code saved', { type: 'success' });
      fetchAndRenderCoupons();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

loadCoupons();
