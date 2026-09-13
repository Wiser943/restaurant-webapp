// Logic for the "My Addresses" page: add / edit / delete saved delivery
// addresses (max 2). Adding one first tries to use the browser's location
// (reverse-geocoded into a readable address the customer can still edit);
// if that location tool isn't working, it falls straight back to a manual
// text field (minimum 4 words).

const MAX_ADDRESSES = 2;
const MIN_ADDRESS_WORDS = 4;

let addresses = [];
const nextParam = new URLSearchParams(window.location.search).get('next');

async function loadAddresses() {
  try {
    await api.get('/auth/me');
  } catch (e) {
    window.location.href = `login.html?next=addresses.html${nextParam ? `%3Fnext%3D${encodeURIComponent(nextParam)}` : ''}`;
    return;
  }
  try {
    const data = await api.get('/auth/addresses');
    addresses = data.addresses || [];
  } catch (e) { addresses = []; }
  render();
}

function wordCount(str) {
  return (str || '').trim().length ? str.trim().split(/\s+/).filter(Boolean).length : 0;
}

function render() {
  const container = document.getElementById('addresses-content');
  const canAddMore = addresses.length < MAX_ADDRESSES;

  container.innerHTML = `
    ${nextParam ? `<p class="helper-text" style="margin-bottom:14px;"><i class="fa-solid fa-circle-info"></i> Pick or add an address below, then head back to finish checking out.</p>` : ''}

    <div id="address-list">
      ${addresses.length ? addresses.map((a) => `
        <div class="card address-card" style="padding:16px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
            <div style="min-width:0;">
              <p style="margin:0 0 4px; font-weight:700; display:flex; align-items:center; gap:8px;">
                <i class="fa-solid ${a.label === 'Work' ? 'fa-briefcase' : a.label === 'Other' ? 'fa-location-dot' : 'fa-house'}"></i>
                ${escapeHtml(a.label || 'Home')}
                ${a.isDefault ? '<span class="badge badge-approved" style="font-size:10px;">Default</span>' : ''}
              </p>
              <p class="helper-text" style="margin:0; word-break:break-word;">${escapeHtml(a.address)}</p>
            </div>
            <div style="display:flex; gap:8px; flex:0 0 auto;">
              <button class="btn btn-ghost btn-sm edit-addr-btn" data-id="${a._id}" aria-label="Edit"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-ghost btn-sm delete-addr-btn" data-id="${a._id}" aria-label="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
          ${!a.isDefault ? `<button class="btn btn-ghost btn-sm set-default-btn" data-id="${a._id}" style="margin-top:10px;"><i class="fa-regular fa-star"></i> Set as default</button>` : ''}
        </div>
      `).join('') : `<div class="empty-state"><p class="helper-text">No saved addresses yet. Add one below.</p></div>`}
    </div>

    ${canAddMore
      ? `<button class="btn btn-primary btn-block" id="add-addr-btn"><i class="fa-solid fa-plus"></i> Add address</button>`
      : `<p class="helper-text" style="text-align:center;">You've saved the maximum of ${MAX_ADDRESSES} addresses. Delete one to add another.</p>`}

    <div id="address-form-wrap"></div>
  `;

  document.querySelectorAll('.edit-addr-btn').forEach((btn) => {
    btn.addEventListener('click', () => openForm(addresses.find((a) => a._id === btn.dataset.id)));
  });
  document.querySelectorAll('.delete-addr-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteAddress(btn.dataset.id));
  });
  document.querySelectorAll('.set-default-btn').forEach((btn) => {
    btn.addEventListener('click', () => saveAddress(btn.dataset.id, { isDefault: true }));
  });
  const addBtn = document.getElementById('add-addr-btn');
  if (addBtn) addBtn.addEventListener('click', () => openForm(null));
}

function openForm(existing) {
  const wrap = document.getElementById('address-form-wrap');
  const isEdit = Boolean(existing);

  wrap.innerHTML = `
    <div class="card" style="padding:18px; margin-top:16px;" id="address-form-card">
      <p class="eyebrow" style="margin-bottom:12px;">${isEdit ? 'Edit address' : 'New address'}</p>

      <div id="locate-row" style="display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" id="locate-btn"><i class="fa-solid fa-location-crosshairs"></i> Use my current location</button>
        <button class="btn btn-ghost btn-sm" id="manual-btn"><i class="fa-solid fa-pen"></i> Type it myself</button>
      </div>
      <p class="helper-text" id="locate-status" style="display:none; margin-bottom:10px;"></p>

      <div class="field">
        <label for="addr-label">Label</label>
        <select id="addr-label">
          <option value="Home" ${!isEdit || existing?.label === 'Home' ? 'selected' : ''}>Home</option>
          <option value="Work" ${existing?.label === 'Work' ? 'selected' : ''}>Work</option>
          <option value="Other" ${existing?.label === 'Other' ? 'selected' : ''}>Other</option>
        </select>
      </div>

      <div class="field">
        <label for="addr-text">Full address <span class="error-text" style="font-size:12px;">*required</span></label>
        <textarea id="addr-text" rows="3" placeholder="e.g. House 12, Block C, Off Marina Road, Calabar">${existing ? escapeHtml(existing.address) : ''}</textarea>
        <span class="helper-text">At least ${MIN_ADDRESS_WORDS} words — street/house, landmark, area, city — so the rider can find you.</span>
        <span class="error-text" id="addr-error" style="display:none;"></span>
      </div>

      <label style="display:flex; align-items:center; gap:8px; margin-bottom:16px; font-size:14px;">
        <input type="checkbox" id="addr-default" ${existing?.isDefault ? 'checked' : ''} style="width:auto;" />
        Use as my default address
      </label>

      <div style="display:flex; gap:10px;">
        <button class="btn btn-primary" id="save-addr-btn" style="flex:1;">${isEdit ? 'Save changes' : 'Save address'}</button>
        <button class="btn btn-ghost" id="cancel-addr-btn">Cancel</button>
      </div>
    </div>
  `;

  document.getElementById('locate-btn').addEventListener('click', () => useCurrentLocation());
  document.getElementById('manual-btn').addEventListener('click', () => {
    document.getElementById('locate-row').style.display = 'none';
    document.getElementById('locate-status').style.display = 'none';
    document.getElementById('addr-text').focus();
  });
  document.getElementById('cancel-addr-btn').addEventListener('click', () => { wrap.innerHTML = ''; });
  document.getElementById('save-addr-btn').addEventListener('click', () => submitForm(existing?._id));

  document.getElementById('address-form-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function useCurrentLocation() {
  const statusEl = document.getElementById('locate-status');
  statusEl.style.display = 'block';
  statusEl.textContent = 'Finding your location…';

  try {
    const loc = await Geo.getCustomerLocation();
    statusEl.textContent = 'Looking up the address for that spot…';

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${loc.lat}&lon=${loc.lng}`);
      const data = await res.json();
      if (data?.display_name) {
        document.getElementById('addr-text').value = data.display_name;
        statusEl.textContent = 'Got a rough address below — please check and edit it before saving.';
      } else {
        throw new Error('No address found for that location.');
      }
    } catch (geocodeErr) {
      // The location tool worked, but couldn't be turned into an address —
      // fall back to manual entry rather than blocking the customer.
      statusEl.textContent = "Couldn't turn your location into an address — please type it in below.";
      document.getElementById('addr-text').focus();
    }
  } catch (locErr) {
    // The location tool itself isn't working (denied, unsupported, timed
    // out, etc.) — fall back to manual entry, per spec.
    statusEl.textContent = `${locErr.message} You can type your address below instead.`;
    document.getElementById('addr-text').focus();
  }
}

async function submitForm(existingId) {
  const btn = document.getElementById('save-addr-btn');
  const errorEl = document.getElementById('addr-error');
  const label = document.getElementById('addr-label').value;
  const address = document.getElementById('addr-text').value.trim();
  const isDefault = document.getElementById('addr-default').checked;

  if (wordCount(address) < MIN_ADDRESS_WORDS) {
    errorEl.textContent = `Please add a bit more detail — at least ${MIN_ADDRESS_WORDS} words. ${wordCount(address)}/${MIN_ADDRESS_WORDS} so far.`;
    errorEl.style.display = 'block';
    document.getElementById('addr-text').classList.add('input-invalid');
    return;
  }
  errorEl.style.display = 'none';

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await saveAddress(existingId, { label, address, isDefault });
    document.getElementById('address-form-wrap').innerHTML = '';
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = existingId ? 'Save changes' : 'Save address';
  }
}

async function saveAddress(id, payload) {
  try {
    const data = id
      ? await api.patch(`/auth/addresses/${id}`, payload)
      : await api.post('/auth/addresses', payload);
    addresses = data.addresses;
    UI.toast(id ? 'Address updated' : 'Address saved', { type: 'success' });
    render();
  } catch (err) {
    UI.toast(err.message, { type: 'danger' });
    throw err;
  }
}

async function deleteAddress(id) {
  const ok = await UI.confirm('Remove this saved address?', { title: 'Delete address', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    const data = await api.del(`/auth/addresses/${id}`);
    addresses = data.addresses;
    UI.toast('Address removed', { type: 'success' });
    render();
  } catch (err) {
    UI.toast(err.message, { type: 'danger' });
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadAddresses();
