// ============================================================
// "Chef's Special" popup — shown on the dashboard the first time each
// session an admin-flagged special item is available. Dismissing it
// (cancel, backdrop tap, or adding to cart) hides it until the browser
// tab/session ends (sessionStorage, not localStorage).
// ============================================================

const SpecialModal = (() => {
  const DISMISS_KEY = 'vc_kitchen_special_dismissed_ids';

  function getDismissedIds() {
    try { return JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]'); }
    catch (e) { return []; }
  }

  function markDismissed(id) {
    const ids = getDismissedIds();
    if (!ids.includes(id)) ids.push(id);
    try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify(ids)); } catch (e) { /* ignore */ }
  }

  function maybeShow(items) {
    const dismissed = getDismissedIds();
    const special = (items || []).find((i) => i.isSpecial && i.isAvailable && !dismissed.includes(i._id));
    if (!special) return;
    // Small delay so it appears after the dashboard has settled in, not
    // the instant the page paints.
    setTimeout(() => show(special), 500);
  }

  function show(item) {
    if (document.querySelector('.special-overlay')) return; // already open

    let quantity = 1;
    let selectedExtras = {};
    let activeTab = 'details';
    let slideIndex = 0;

    const overlay = document.createElement('div');
    overlay.className = 'special-overlay';
    overlay.innerHTML = cardMarkup(item, false);
    document.body.appendChild(overlay);

    function close() {
      markDismissed(item._id);
      overlay.classList.add('closing');
      setTimeout(() => overlay.remove(), 230);
    }

    function rerender(expanded) {
      overlay.innerHTML = cardMarkup(item, expanded, { quantity, activeTab, selectedExtras, slideIndex });
      bind(expanded);
    }

    function bind(expanded) {
      overlay.querySelector('.special-close')?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); }, { once: true });

      const track = overlay.querySelector('.special-media-track');
      if (track) {
        track.addEventListener('scroll', () => {
          const idx = Math.round(track.scrollLeft / track.clientWidth);
          overlay.querySelectorAll('.special-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
          slideIndex = idx;
        });
      }

      if (!expanded) {
        overlay.querySelector('.view-details-btn')?.addEventListener('click', () => { activeTab = 'details'; rerender(true); });
        return;
      }

      overlay.querySelectorAll('.special-tab').forEach((tab) => {
        tab.addEventListener('click', () => { activeTab = tab.dataset.tab; rerender(true); });
      });

      overlay.querySelector('.qty-minus-btn')?.addEventListener('click', () => { quantity = Math.max(1, quantity - 1); rerender(true); });
      overlay.querySelector('.qty-plus-btn')?.addEventListener('click', () => { quantity += 1; rerender(true); });

      overlay.querySelectorAll('.special-extra-toggle').forEach((box) => {
        box.addEventListener('change', () => {
          const name = box.dataset.name;
          if (box.checked) selectedExtras[name] = 1; else delete selectedExtras[name];
          rerender(true);
        });
      });

      overlay.querySelector('.special-add-btn')?.addEventListener('click', async () => {
        const btn = overlay.querySelector('.special-add-btn');
        btn.disabled = true;
        btn.textContent = 'Adding…';
        try {
          let me = null;
          try { me = (await api.get('/auth/me')).user; } catch (e) { /* guest */ }
          if (!me) { window.location.href = `login.html?next=index.html`; return; }

          const extras = Object.entries(selectedExtras)
            .filter(([, qty]) => qty > 0)
            .map(([name, qty]) => ({ name, quantity: qty }));
          await api.post('/cart', { menuItemId: item._id, quantity, extras });
          UI.toast(`${item.name} added to your cart`, { type: 'success' });
          if (typeof renderNav === 'function') renderNav();
          close();
        } catch (err) {
          UI.toast(err.message || 'Could not add this item.', { type: 'danger' });
          btn.disabled = false;
          btn.textContent = `Add to Cart · ${currencyLocal(item.currentPrice * quantity + extrasTotal(item, selectedExtras))}`;
        }
      });
    }

    bind(false);
  }

  function extrasTotal(item, selectedExtras) {
    return (item.extras || []).reduce((sum, ex) => sum + ex.price * (selectedExtras[ex.name] || 0), 0);
  }

  function currencyLocal(n) {
    return typeof currency === 'function' ? currency(n) : `₦${Number(n).toLocaleString()}`;
  }

  function cardMarkup(item, expanded, extra = {}) {
    const images = item.images && item.images.length ? item.images : [null];
    const quantity = extra.quantity || 1;
    const activeTab = extra.activeTab || 'details';
    const selectedExtras = extra.selectedExtras || {};

    return `
      <div class="special-card">
        <button class="special-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        <div class="special-media">
          <span class="special-badge"><i class="fa-solid fa-fire"></i> Chef's Special</span>
          <div class="special-steam"><span class="steam-wisp"></span><span class="steam-wisp"></span><span class="steam-wisp"></span></div>
          <div class="special-media-track">
            ${images.map((src) => `
              <div class="special-media-slide">
                ${src ? `<img src="${src}" alt="${escapeHtml(item.name)}" />` : `<div class="hero-placeholder display" style="height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;">${escapeHtml(item.name.charAt(0))}</div>`}
              </div>`).join('')}
          </div>
          ${images.length > 1 ? `<div class="special-dots">${images.map((_, i) => `<span class="special-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>` : ''}
        </div>

        <div class="special-body">
          ${!expanded ? renderSummary(item) : renderDetails(item, quantity, activeTab, selectedExtras)}
        </div>
      </div>
    `;
  }

  function renderSummary(item) {
    return `
      <div class="special-eyebrow"><span class="eyebrow"><i class="fa-solid fa-kitchen-set"></i> Fresh from the kitchen, just for you</span></div>
      <h2 class="special-name">${escapeHtml(item.name)}</h2>
      ${item.description ? `<p class="special-desc">${escapeHtml(item.description)}</p>` : ''}
      <div class="special-price-row">
        <span class="special-price">${currencyLocal(item.currentPrice)}</span>
        ${item.previousPrice != null && item.currentPrice < item.previousPrice ? `<span class="helper-text" style="text-decoration:line-through;">${currencyLocal(item.previousPrice)}</span>` : ''}
      </div>
      <div class="special-actions">
        <button class="btn btn-ghost btn-block special-maybe-later" onclick="this.closest('.special-overlay').querySelector('.special-close').click()">Not now</button>
        <button class="btn btn-primary btn-block view-details-btn">View Details</button>
      </div>
    `;
  }

  function renderDetails(item, quantity, activeTab, selectedExtras) {
    const hasExtras = item.extras && item.extras.length;
    const total = item.currentPrice * quantity + extrasTotal(item, selectedExtras);

    return `
      <h2 class="special-name" style="font-size:20px;">${escapeHtml(item.name)}</h2>
      <div class="special-tabs">
        <button class="special-tab ${activeTab === 'details' ? 'active' : ''}" data-tab="details">Details</button>
        <button class="special-tab ${activeTab === 'extras' ? 'active' : ''}" data-tab="extras">Extras${hasExtras ? ` (${item.extras.length})` : ''}</button>
      </div>

      ${activeTab === 'details' ? `
        ${item.description ? `<p class="special-desc" style="-webkit-line-clamp:unset;">${escapeHtml(item.description)}</p>` : `<p class="helper-text">A kitchen favorite, made fresh today.</p>`}
        <div class="special-price-row"><span class="special-price">${currencyLocal(item.currentPrice)}</span></div>
      ` : `
        ${hasExtras ? item.extras.map((ex) => `
          <div class="special-extra-row">
            <div>
              <div>${escapeHtml(ex.name)}</div>
              <div class="helper-text" style="font-size:12px;">+ ${currencyLocal(ex.price)} each</div>
            </div>
            <label class="switch">
              <input type="checkbox" class="special-extra-toggle" data-name="${escapeAttr(ex.name)}" ${selectedExtras[ex.name] ? 'checked' : ''} />
              <span class="switch-track"></span>
            </label>
          </div>
        `).join('') : `<p class="helper-text">No extras available for this item.</p>`}
      `}

      <div class="special-qty-row" style="margin-top:16px;">
        <span class="qty-label">Quantity</span>
        <div class="stepper">
          <button type="button" class="qty-minus-btn" aria-label="Decrease"><i class="fa-solid fa-minus"></i></button>
          <span>${quantity}</span>
          <button type="button" class="qty-plus-btn" aria-label="Increase"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>

      <button class="btn btn-primary btn-block special-add-btn"><i class="fa-solid fa-cart-plus"></i> Add to Cart · ${currencyLocal(total)}</button>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  return { maybeShow };
})();
