// Logic for the admin settings page: bank details + banners

async function loadSettings() {
  const admin = await requireAdmin();
  if (!admin) return;

  try {
    const data = await api.get('/payment-info');
    document.getElementById('s-bank').value = data.paymentInfo.bankName || '';
    document.getElementById('s-account').value = data.paymentInfo.accountNumber || '';
    document.getElementById('s-name').value = data.paymentInfo.accountName || '';
    document.getElementById('s-instructions').value = data.paymentInfo.instructions || '';
  } catch (e) { /* not set up yet - fields just start empty */ }

  try {
    const data = await api.get('/contact-info');
    document.getElementById('c-phone').value = data.contactInfo.phone || '';
    document.getElementById('c-whatsapp').value = data.contactInfo.whatsapp || '';
    document.getElementById('c-email').value = data.contactInfo.email || '';
    document.getElementById('c-hours').value = data.contactInfo.hours || '';
    document.getElementById('c-address').value = data.contactInfo.address || '';
  } catch (e) { /* not set up yet - fields just start empty */ }

  document.getElementById('save-payment-btn').addEventListener('click', savePaymentInfo);
  document.getElementById('save-contact-btn').addEventListener('click', saveContactInfo);
  document.getElementById('new-banner-btn').addEventListener('click', () => openBannerForm(null));
  document.getElementById('add-rider-btn').addEventListener('click', addRider);

  await fetchAndRenderRiders();
  await fetchAndRenderBanners();
}

async function fetchAndRenderRiders() {
  const list = document.getElementById('rider-list');
  try {
    const data = await api.get('/admin/suppliers');
    if (!data.suppliers.length) {
      list.innerHTML = `<p class="helper-text">No riders yet.</p>`;
      return;
    }
    list.innerHTML = data.suppliers.map((s) => `
      <div class="card" style="padding:12px 16px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <p style="margin:0 0 2px; font-weight:600;">${s.name}</p>
          <p class="helper-text" style="margin:0;">${s.email}${s.phone ? ` · ${s.phone}` : ''}</p>
        </div>
        <span class="badge badge-approved"><i class="fa-solid fa-motorcycle"></i> Rider</span>
      </div>`).join('');
  } catch (e) {
    list.innerHTML = `<p class="helper-text">Could not load riders.</p>`;
  }
}

async function addRider() {
  const errorEl = document.getElementById('rider-error');
  errorEl.style.display = 'none';
  try {
    await api.post('/admin/suppliers', {
      name: document.getElementById('r-name').value,
      email: document.getElementById('r-email').value,
      phone: document.getElementById('r-phone').value,
      password: document.getElementById('r-password').value,
    });
    document.getElementById('r-name').value = '';
    document.getElementById('r-email').value = '';
    document.getElementById('r-phone').value = '';
    document.getElementById('r-password').value = '';
    UI.toast('Rider account created', { type: 'success' });
    fetchAndRenderRiders();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

async function saveContactInfo() {
  const errorEl = document.getElementById('contact-error');
  const savedEl = document.getElementById('contact-saved');
  errorEl.style.display = 'none';
  savedEl.style.display = 'none';

  try {
    await api.put('/admin/contact-info', {
      phone: document.getElementById('c-phone').value,
      whatsapp: document.getElementById('c-whatsapp').value,
      email: document.getElementById('c-email').value,
      hours: document.getElementById('c-hours').value,
      address: document.getElementById('c-address').value,
    });
    savedEl.style.display = 'block';
    setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

async function savePaymentInfo() {
  const errorEl = document.getElementById('payment-error');
  const savedEl = document.getElementById('payment-saved');
  errorEl.style.display = 'none';
  savedEl.style.display = 'none';

  try {
    await api.put('/admin/payment-info', {
      bankName: document.getElementById('s-bank').value,
      accountNumber: document.getElementById('s-account').value,
      accountName: document.getElementById('s-name').value,
      instructions: document.getElementById('s-instructions').value,
    });
    savedEl.style.display = 'block';
    setTimeout(() => { savedEl.style.display = 'none'; }, 2000);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

let banners = [];

async function fetchAndRenderBanners() {
  const data = await api.get('/banners');
  banners = data.banners;
  const list = document.getElementById('banner-list');

  if (!banners.length) {
    list.innerHTML = `<p class="helper-text">No active banners. Note: this list only shows currently-active banners.</p>`;
    return;
  }

  list.innerHTML = banners.map((b) => `
    <div class="card" style="padding:14px 16px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
      <div>
        <p style="margin:0 0 4px; font-weight:600;">${b.title}</p>
        <p class="helper-text" style="margin:0;">Priority ${b.priority}</p>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="btn btn-ghost btn-sm edit-banner-btn" data-id="${b._id}">Edit</button>
        <button class="btn btn-danger btn-sm delete-banner-btn" data-id="${b._id}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.edit-banner-btn').forEach((btn) => {
    btn.addEventListener('click', () => openBannerForm(banners.find((b) => b._id === btn.dataset.id)));
  });
  list.querySelectorAll('.delete-banner-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await UI.confirm('Delete this banner?', { confirmText: 'Delete', danger: true });
      if (!ok) return;
      await api.del(`/admin/banners/${btn.dataset.id}`);
      UI.toast('Banner deleted', { type: 'success' });
      fetchAndRenderBanners();
    });
  });
}

function openBannerForm(banner) {
  const editingId = banner?._id || null;
  const wrap = document.getElementById('banner-form-wrap');

  wrap.innerHTML = `
    <div class="card" style="padding:20px; margin-bottom:20px;">
      <p class="eyebrow" style="margin-bottom:10px;">${banner ? 'Edit banner' : 'New banner'}</p>
      <div class="field"><label>Title</label><input id="b-title" value="${banner?.title || ''}" /></div>
      <div class="field"><label>Image URL</label><input id="b-image" value="${banner?.imageUrl || ''}" placeholder="https://..." /></div>
      <div class="field"><label>Link to (optional)</label><input id="b-link" value="${banner?.linkTo || ''}" /></div>
      <div class="field"><label>Priority (higher shows first)</label><input id="b-priority" type="number" value="${banner?.priority ?? 0}" /></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary" id="save-banner-btn">Save</button>
        <button class="btn btn-ghost" id="cancel-banner-btn">Cancel</button>
      </div>
      <p class="error-text" id="banner-form-error" style="display:none;"></p>
    </div>
  `;

  document.getElementById('cancel-banner-btn').addEventListener('click', () => { wrap.innerHTML = ''; });
  document.getElementById('save-banner-btn').addEventListener('click', async () => {
    const payload = {
      title: document.getElementById('b-title').value,
      imageUrl: document.getElementById('b-image').value,
      linkTo: document.getElementById('b-link').value,
      priority: Number(document.getElementById('b-priority').value) || 0,
      isActive: true,
    };
    try {
      if (editingId) await api.put(`/admin/banners/${editingId}`, payload);
      else await api.post('/admin/banners', payload);
      wrap.innerHTML = '';
      fetchAndRenderBanners();
    } catch (err) {
      document.getElementById('banner-form-error').textContent = err.message;
      document.getElementById('banner-form-error').style.display = 'block';
    }
  });
}

loadSettings();
