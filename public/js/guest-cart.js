// Lets someone browse the menu and build a cart WITHOUT an account first -
// login/signup is only required at actual checkout. Mirrors the shape the
// real /api/cart endpoints return (line.menuItem, line.quantity,
// line.extras, line.lineId) so cart-page.js and nav.js don't need separate
// render paths for guest vs. logged-in carts.

const GUEST_CART_KEY = 'vck_guest_cart';

const GuestCart = {
  getItems() {
    try {
      const raw = localStorage.getItem(GUEST_CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  _save(items) {
    try { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items)); } catch (e) { /* ignore */ }
  },

  // item: the full menu item object (from item.js's `item`, or a home.js
  // grid entry). extras: [{ name, quantity }] - price is looked up from
  // the item's own extras definitions, same as the server does.
  add(item, quantity, extras) {
    const items = this.getItems();
    const extrasWithPrice = (extras || [])
      .filter((e) => e.quantity > 0)
      .map((e) => {
        const def = (item.extras || []).find((d) => d.name === e.name);
        return { name: e.name, quantity: e.quantity, price: def ? def.price : 0 };
      });

    // Two lines are "the same" if it's the same item with the same extras -
    // matches how the real cart merges lines.
    const signature = extrasWithPrice.map((e) => `${e.name}:${e.quantity}`).sort().join('|');
    const lineId = `guest-${item._id}-${signature}`;

    const existing = items.find((l) => l.lineId === lineId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({
        lineId,
        menuItem: {
          _id: item._id,
          name: item.name,
          currentPrice: item.currentPrice,
          images: item.images,
          isAvailable: item.isAvailable,
          extras: item.extras,
        },
        quantity,
        extras: extrasWithPrice,
        priceAtAdd: item.currentPrice,
      });
    }
    this._save(items);
    return items;
  },

  updateQuantity(lineId, quantity) {
    let items = this.getItems();
    if (quantity <= 0) {
      items = items.filter((l) => l.lineId !== lineId);
    } else {
      const line = items.find((l) => l.lineId === lineId);
      if (line) line.quantity = quantity;
    }
    this._save(items);
    return items;
  },

  remove(lineId) {
    const items = this.getItems().filter((l) => l.lineId !== lineId);
    this._save(items);
    return items;
  },

  clear() {
    this._save([]);
  },

  count() {
    return this.getItems().reduce((sum, l) => sum + l.quantity, 0);
  },

  // Called right after a successful login/signup: pushes every guest-cart
  // line into the now-authenticated account's real cart (skipping any that
  // fail - e.g. gone unavailable since it was added), then clears local
  // storage so nothing gets double-added on a future guest session.
  async mergeIntoAccount() {
    const items = this.getItems();
    if (!items.length) return { added: 0, skipped: 0 };
    let added = 0;
    let skipped = 0;
    for (const line of items) {
      try {
        await api.post('/cart', {
          menuItemId: line.menuItem._id,
          quantity: line.quantity,
          extras: line.extras,
        });
        added += 1;
      } catch (e) {
        skipped += 1;
      }
    }
    this.clear();
    return { added, skipped };
  },
};
