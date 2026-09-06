// Logic for the admin "Users Management" page: stat cards + a searchable,
// filterable, paginated table covering both customers and suppliers.

let state = {
  search: '',
  role: '',
  status: '',
  sort: 'newest',
  page: 1,
  limit: 10,
};
let lastRows = [];
let searchDebounce = null;

async function loadUsersPage() {
  const admin = await requireAdmin();
  if (!admin) return;

  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const value = e.target.value;
    searchDebounce = setTimeout(() => { state.search = value; state.page = 1; fetchAndRender(); }, 350);
  });
  document.getElementById('role-filter').addEventListener('change', (e) => { state.role = e.target.value; state.page = 1; fetchAndRender(); });
  document.getElementById('status-filter').addEventListener('change', (e) => { state.status = e.target.value; state.page = 1; fetchAndRender(); });
  document.getElementById('sort-select').addEventListener('change', (e) => { state.sort = e.target.value; state.page = 1; fetchAndRender(); });
  document.getElementById('export-btn').addEventListener('click', exportCsv);

  await fetchAndRender();
}

async function fetchAndRender() {
  const wrap = document.getElementById('users-table-wrap');
  wrap.innerHTML = `<p class="helper-text" style="padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Loading users…</p>`;

  const params = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    sort: state.sort,
  });
  if (state.search) params.set('search', state.search);
  if (state.role) params.set('role', state.role);
  if (state.status) params.set('status', state.status);

  let data;
  try {
    data = await api.get(`/admin/users?${params.toString()}`);
  } catch (err) {
    wrap.innerHTML = `<p class="error-text" style="padding:20px;">${err.message}</p>`;
    return;
  }

  lastRows = data.users;
  renderStats(data.stats);
  renderTable(data.users, data.pagination);
  renderPagination(data.pagination);

  document.getElementById('results-count').textContent = `All Users (${data.pagination.total.toLocaleString()})`;
}

function renderStats(stats) {
  const cards = [
    {
      label: 'Total Users', value: stats.totalUsers.toLocaleString(), icon: 'fa-users', color: 'orange',
      trend: `${stats.totalCustomers.toLocaleString()} customers · ${stats.totalSuppliers.toLocaleString()} suppliers`,
    },
    {
      label: 'New Users (This Month)', value: stats.newThisMonth.toLocaleString(), icon: 'fa-user-plus', color: 'sage',
      trend: `${stats.newThisMonthGrowthPct >= 0 ? '↑' : '↓'} ${Math.abs(stats.newThisMonthGrowthPct)}% vs last month`,
      down: stats.newThisMonthGrowthPct < 0,
    },
    {
      label: 'Total Orders', value: stats.totalOrders.toLocaleString(), icon: 'fa-bag-shopping', color: 'blue',
    },
    {
      label: 'Avg. Orders / Customer', value: stats.averageOrdersPerUser.toLocaleString(), icon: 'fa-chart-line', color: 'violet',
    },
  ];

  document.getElementById('stat-cards').innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-card-top">
        <span class="stat-label">${c.label}</span>
        <span class="stat-icon ${c.color}"><i class="fa-solid ${c.icon}"></i></span>
      </div>
      <span class="stat-value">${c.value}</span>
      ${c.trend ? `<span class="stat-trend ${c.down ? 'down' : ''}">${c.trend}</span>` : ''}
    </div>
  `).join('');
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
}

function renderTable(users, pagination) {
  const wrap = document.getElementById('users-table-wrap');

  if (!users.length) {
    wrap.innerHTML = `<div class="empty-state" style="padding:40px 20px; text-align:center;"><p class="eyebrow">No matches</p><h3 class="display" style="margin:6px 0;">No users found</h3><p class="helper-text">Try a different search term or filter.</p></div>`;
    return;
  }

  wrap.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="users-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Registered On</th>
            <th>Total Orders</th>
            <th>Total Spent</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td class="user-cell-td">
                <div class="user-cell">
                  <div class="user-avatar">${initials(u.name)}</div>
                  <div>
                    <div class="user-name">${escapeHtml(u.name)}</div>
                    <div class="user-id">#${String(u._id).slice(-6).toUpperCase()}</div>
                  </div>
                </div>
              </td>
              <td data-label="Email">${escapeHtml(u.email)}</td>
              <td data-label="Role"><span class="role-badge ${u.role}">${u.role}</span></td>
              <td data-label="Registered On">${formatDate(u.createdAt)}</td>
              <td data-label="Total Orders">${u.totalOrders}</td>
              <td data-label="Total Spent">${currency(u.totalSpent)}</td>
              <td data-label="Status">
                <span class="status-pill ${u.isActive ? 'active' : 'inactive'}">${u.isActive ? 'Active' : 'Inactive'}</span>
              </td>
              <td data-label="Actions">
                <button class="btn btn-ghost btn-sm toggle-status-btn" data-id="${u._id}" data-active="${u.isActive}">
                  ${u.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('.toggle-status-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const makeActive = btn.dataset.active !== 'true';
      btn.disabled = true;
      try {
        await api.patch(`/admin/users/${btn.dataset.id}/status`, { isActive: makeActive });
        UI.toast(makeActive ? 'User activated' : 'User deactivated', { type: 'success' });
        fetchAndRender();
      } catch (err) {
        UI.toast(err.message, { type: 'danger' });
        btn.disabled = false;
      }
    });
  });
}

function renderPagination(pagination) {
  const el = document.getElementById('pagination');
  const { page, totalPages, total, limit } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  const pages = [];
  const windowSize = 2;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || (p >= page - windowSize && p <= page + windowSize)) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }

  el.innerHTML = `
    <span class="helper-text">Showing ${from} to ${to} of ${total.toLocaleString()} users</span>
    <div class="page-btns">
      <button id="prev-page" ${page <= 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>
      ${pages.map((p) => p === '…'
        ? `<span class="helper-text" style="padding:0 4px;">…</span>`
        : `<button class="page-num ${p === page ? 'active' : ''}" data-page="${p}">${p}</button>`).join('')}
      <button id="next-page" ${page >= totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>
    </div>
  `;

  el.querySelector('#prev-page')?.addEventListener('click', () => { state.page = Math.max(1, state.page - 1); fetchAndRender(); });
  el.querySelector('#next-page')?.addEventListener('click', () => { state.page = Math.min(totalPages, state.page + 1); fetchAndRender(); });
  el.querySelectorAll('.page-num').forEach((btn) => {
    btn.addEventListener('click', () => { state.page = Number(btn.dataset.page); fetchAndRender(); });
  });
}

function exportCsv() {
  if (!lastRows.length) { UI.toast('Nothing to export on this page yet.', { type: 'info' }); return; }
  const headers = ['Name', 'Email', 'Phone', 'Role', 'Registered On', 'Total Orders', 'Total Spent', 'Status'];
  const rows = lastRows.map((u) => [
    u.name, u.email, u.phone, u.role, formatDate(u.createdAt), u.totalOrders, u.totalSpent, u.isActive ? 'Active' : 'Inactive',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vc-kitchen-users-page${state.page}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

loadUsersPage();
