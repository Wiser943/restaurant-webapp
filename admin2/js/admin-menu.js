// Logic for the admin "manage menu items" page

let items = [];
let editingId = null;
let formExtras = []; // [{ name, price }] while the form is open

async function loadMenu() {
  const admin = await requireAdmin();
  if (!admin) return;

  document.getElementById('new-item-btn').addEventListener('click', () => openForm(null));
  await fetchAndRender();
}

async function fetchAndRender() {
  const data = await api.get('/menu');
  items = data.items;
  renderList();
}

function renderList() {
  const list = document.getElementById('menu-list');
  if (!items.length) {
    list.innerHTML = `<p class="helper-text">No menu items yet. Add your first one above.</p>`;
    return;
  }

  list.innerHTML = items.map((item) => `
    <div class="card" style="padding:14px 16px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <p style="margin:0 0 4px; font-weight:600;">${item.name} <span class="helper-text">(${item.category})</span></p>
        <p style="margin:0; font-family:var(--font-mono); color:var(--orange-soft);">${currency(item.currentPrice)}</p>
        ${item.extras?.length ? `<p class="helper-text" style="margin:4px 0 0;"><i class="fa-solid fa-plus"></i> ${item.extras.map((e) => `${e.name} (${currency(e.price)})`).join(', ')}</p>` : ''}
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-muted);">
          <input type="checkbox" class="avail-toggle" data-id="${item._id}" ${item.isAvailable ? 'checked' : ''} />
          Ready to order
        </label>
        <button class="btn btn-ghost btn-sm edit-btn" data-id="${item._id}"><i class="fa-solid fa-pen"></i> Edit</button>
        <button class="btn btn-danger btn-sm delete-btn" data-id="${item._id}"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.avail-toggle').forEach((box) => {
    box.addEventListener('change', async () => {
      await api.patch(`/menu/${box.dataset.id}/availability`, { isAvailable: box.checked });
    });
  });
  list.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openForm(items.find((i) => i._id === btn.dataset.id)));
  });
  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await UI.confirm('This removes the item from the menu for good.', { title: 'Delete this item?', confirmText: 'Delete', danger: true });
      if (!ok) return;
      await api.del(`/menu/${btn.dataset.id}`);
      UI.toast('Item deleted', { type: 'success' });
      fetchAndRender();
    });
  });
}

function renderExtrasEditor() {
  const wrap = document.getElementById('extras-editor');
  wrap.innerHTML = `
    <label style="display:block; margin-bottom:8px;">Extras / add-ons (optional)</label>
    ${formExtras.map((ex, idx) => `
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <input class="extra-name-input" data-idx="${idx}" placeholder="e.g. Kpomo" value="${ex.name}" style="flex:2;" />
        <input class="extra-price-input" data-idx="${idx}" type="number" placeholder="Price" value="${ex.price}" style="flex:1;" />
        <button type="button" class="btn btn-ghost btn-icon remove-extra" data-idx="${idx}" aria-label="Remove"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('')}
    <button type="button" class="btn btn-ghost btn-sm" id="add-extra-row"><i class="fa-solid fa-plus"></i> Add an extra</button>
  `;

  wrap.querySelectorAll('.extra-name-input').forEach((inp) => {
    inp.addEventListener('input', () => { formExtras[inp.dataset.idx].name = inp.value; });
  });
  wrap.querySelectorAll('.extra-price-input').forEach((inp) => {
    inp.addEventListener('input', () => { formExtras[inp.dataset.idx].price = Number(inp.value) || 0; });
  });
  wrap.querySelectorAll('.remove-extra').forEach((btn) => {
    btn.addEventListener('click', () => { formExtras.splice(Number(btn.dataset.idx), 1); renderExtrasEditor(); });
  });
  document.getElementById('add-extra-row').addEventListener('click', () => {
    formExtras.push({ name: '', price: 0 });
    renderExtrasEditor();
  });
}

function openForm(item) {
  editingId = item?._id || null;
  formExtras = (item?.extras || []).map((e) => ({ name: e.name, price: e.price }));
  const wrap = document.getElementById('item-form-wrap');

  wrap.innerHTML = `
    <div class="card" style="padding:20px; margin-bottom:20px;">
      <p class="eyebrow" style="margin-bottom:10px;">${item ? 'Edit item' : 'New item'}</p>
      <div class="field"><label>Name</label><input id="f-name" value="${item?.name || ''}" /></div>
      <div class="field"><label>Category</label><input id="f-category" value="${item?.category || ''}" placeholder="e.g. Grill, Drinks, Rice" /></div>
      <div class="field"><label>Description</label><textarea id="f-desc" rows="2">${item?.description || ''}</textarea></div>
      <div class="field"><label>Price (₦)</label><input id="f-price" type="number" value="${item?.currentPrice || ''}" /></div>
      <div class="field"><label>Image URL (optional)</label><input id="f-image" value="${item?.images?.[0] || ''}" placeholder="https://..." /></div>
      <div class="field">
        <label><input type="checkbox" id="f-always" ${item?.isAlwaysOnMenu !== false ? 'checked' : ''} /> Always on the menu</label>
      </div>
      <div class="ticket-tear"></div>
      <div class="field" id="extras-editor"></div>
      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary" id="save-btn">Save</button>
        <button class="btn btn-ghost" id="cancel-btn">Cancel</button>
      </div>
      <p class="error-text" id="form-error" style="display:none;"></p>
    </div>
  `;

  renderExtrasEditor();
  document.getElementById('cancel-btn').addEventListener('click', () => { wrap.innerHTML = ''; });
  document.getElementById('save-btn').addEventListener('click', saveItem);
}

async function saveItem() {
  const errorEl = document.getElementById('form-error');
  errorEl.style.display = 'none';

  const cleanExtras = formExtras
    .map((e) => ({ name: e.name.trim(), price: Number(e.price) || 0 }))
    .filter((e) => e.name);

  const payload = {
    name: document.getElementById('f-name').value,
    category: document.getElementById('f-category').value,
    description: document.getElementById('f-desc').value,
    currentPrice: Number(document.getElementById('f-price').value),
    images: document.getElementById('f-image').value ? [document.getElementById('f-image').value] : [],
    isAlwaysOnMenu: document.getElementById('f-always').checked,
    extras: cleanExtras,
  };

  try {
    if (editingId) {
      await api.put(`/menu/${editingId}`, payload);
    } else {
      payload.isAvailable = true;
      await api.post('/menu', payload);
    }
    document.getElementById('item-form-wrap').innerHTML = '';
    UI.toast('Menu item saved', { type: 'success' });
    fetchAndRender();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
}

loadMenu();
