// Logic for the admin reviews moderation page: list, hide/unhide, delete.

let reviews = [];
let activeTab = 'visible'; // 'visible' | 'hidden'

const TABS = [
  { key: 'visible', label: 'Visible' },
  { key: 'hidden', label: 'Hidden' },
];

async function loadReviews() {
  const admin = await requireAdmin();
  if (!admin) return;

  renderTabs();
  await fetchAndRenderReviews();
}

function renderTabs() {
  const wrap = document.getElementById('review-tabs');
  wrap.innerHTML = TABS.map((t) => `<button type="button" class="filter-chip ${activeTab === t.key ? 'active' : ''}" data-key="${t.key}">${t.label}</button>`).join('');
  wrap.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeTab = chip.dataset.key;
      renderTabs();
      fetchAndRenderReviews();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

async function fetchAndRenderReviews() {
  const list = document.getElementById('review-list');
  list.innerHTML = `<p class="helper-text">Loading…</p>`;

  try {
    const data = await api.get(`/admin/reviews?hidden=${activeTab === 'hidden'}`);
    reviews = data.reviews;
  } catch (e) {
    list.innerHTML = `<p class="helper-text">Could not load reviews.</p>`;
    return;
  }

  if (!reviews.length) {
    list.innerHTML = `<p class="helper-text">No ${activeTab} reviews.</p>`;
    return;
  }

  list.innerHTML = reviews.map((r) => `
    <div class="card" style="padding:14px 16px; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <p style="margin:0 0 4px; font-weight:700;">${escapeHtml(r.menuItem?.name || 'Item removed')}</p>
          <div class="stars" style="color:var(--orange); font-size:13px; margin-bottom:4px;">
            ${Array.from({ length: 5 }).map((_, i) => `<i class="fa-solid fa-star" style="${i < r.rating ? '' : 'color:var(--glass-border-strong);'}"></i>`).join('')}
          </div>
          <p class="helper-text" style="margin:0;">${escapeHtml(r.userName)} · ${new Date(r.createdAt).toLocaleDateString()}</p>
          ${r.comment ? `<p style="margin:8px 0 0; font-size:13.5px;">${escapeHtml(r.comment)}</p>` : ''}
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:12px;">
        <button class="btn btn-ghost btn-sm toggle-hidden-btn" data-id="${r._id}" data-hidden="${r.hidden}">${r.hidden ? 'Unhide' : 'Hide'}</button>
        <button class="btn btn-danger btn-sm delete-review-btn" data-id="${r._id}">Delete</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.toggle-hidden-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const hidden = btn.dataset.hidden === 'true';
      await api.patch(`/admin/reviews/${btn.dataset.id}`, { hidden: !hidden });
      UI.toast(hidden ? 'Review unhidden' : 'Review hidden', { type: 'success' });
      fetchAndRenderReviews();
    });
  });

  list.querySelectorAll('.delete-review-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ok = await UI.confirm('Delete this review permanently?', { confirmText: 'Delete', danger: true });
      if (!ok) return;
      await api.del(`/admin/reviews/${btn.dataset.id}`);
      UI.toast('Review deleted', { type: 'success' });
      fetchAndRenderReviews();
    });
  });
}

loadReviews();
