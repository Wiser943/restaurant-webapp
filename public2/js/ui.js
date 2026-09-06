// ============================================================
// Shared UI helpers: custom modal (replaces alert/confirm/prompt),
// toast notifications, and short synthesized notification tones.
// Loaded on every page (customer, admin, supplier) via /js/ui.js
// ============================================================

const UI = (() => {
  let root = null;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'ui-modal-root';
    document.body.appendChild(root);
    return root;
  }

  function iconFor(kind) {
    const icons = {
      info: 'fa-circle-info',
      success: 'fa-circle-check',
      danger: 'fa-triangle-exclamation',
      question: 'fa-circle-question',
    };
    return icons[kind] || icons.info;
  }

  function buildModal({ title, message, kind = 'info', buttons }) {
    const overlay = document.createElement('div');
    overlay.className = 'ui-modal-overlay';
    overlay.innerHTML = `
      <div class="ui-modal glass-strong rise-in" role="dialog" aria-modal="true">
        <div class="ui-modal-icon ui-modal-icon-${kind}"><i class="fa-solid ${iconFor(kind)}"></i></div>
        ${title ? `<h3 class="ui-modal-title">${title}</h3>` : ''}
        ${message ? `<p class="ui-modal-message">${message}</p>` : ''}
        <div class="ui-modal-input-wrap" style="display:none;">
          <input type="text" class="ui-modal-input" />
        </div>
        <div class="ui-modal-actions"></div>
      </div>
    `;
    return overlay;
  }

  function open({ title, message, kind, buttons, withInput = false, inputValue = '' }) {
    return new Promise((resolve) => {
      const overlay = buildModal({ title, message, kind, buttons });
      const actions = overlay.querySelector('.ui-modal-actions');
      const inputWrap = overlay.querySelector('.ui-modal-input-wrap');
      const input = overlay.querySelector('.ui-modal-input');

      if (withInput) {
        inputWrap.style.display = 'block';
        input.value = inputValue;
      }

      function close(result) {
        overlay.classList.add('closing');
        setTimeout(() => overlay.remove(), 160);
        resolve(result);
      }

      buttons.forEach((b) => {
        const btn = document.createElement('button');
        btn.className = `btn btn-sm ${b.variant === 'primary' ? 'btn-primary' : b.variant === 'danger' ? 'btn-danger' : 'btn-ghost'}`;
        btn.textContent = b.label;
        btn.addEventListener('click', () => close(withInput ? (b.value === undefined ? input.value : b.value) : b.value));
        actions.appendChild(btn);
      });

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay && buttons.some((b) => b.dismissible)) {
          close(buttons.find((b) => b.dismissible).value);
        }
      });

      ensureRoot().appendChild(overlay);
      if (withInput) setTimeout(() => input.focus(), 50);
    });
  }

  return {
    alert(message, { title = 'Heads up', kind = 'info' } = {}) {
      return open({
        title,
        message,
        kind,
        buttons: [{ label: 'OK', value: true, variant: 'primary', dismissible: true }],
      });
    },

    confirm(message, { title = 'Please confirm', kind = 'question', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
      return open({
        title,
        message,
        kind: danger ? 'danger' : kind,
        buttons: [
          { label: cancelText, value: false, variant: 'ghost', dismissible: true },
          { label: confirmText, value: true, variant: danger ? 'danger' : 'primary' },
        ],
      });
    },

    prompt(message, { title = 'One more thing', defaultValue = '', confirmText = 'Save' } = {}) {
      return open({
        title,
        message,
        kind: 'question',
        withInput: true,
        inputValue: defaultValue,
        buttons: [
          { label: 'Cancel', value: null, variant: 'ghost', dismissible: true },
          { label: confirmText, variant: 'primary' },
        ],
      });
    },

    toast(message, { type = 'info', duration = 3200 } = {}) {
      const el = document.createElement('div');
      el.className = `ui-toast ui-toast-${type}`;
      const icons = { info: 'fa-circle-info', success: 'fa-circle-check', danger: 'fa-triangle-exclamation' };
      el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${message}</span>`;
      ensureRoot().appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 250);
      }, duration);
    },
  };
})();

// ============================================================
// Notification tones - synthesized with the Web Audio API so no
// audio files are needed. A user gesture unlocks audio on most
// browsers; we lazily create/resume the context on first use.
// ============================================================
const Sound = (() => {
  let ctx = null;
  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, duration, { type = 'sine', gain = 0.18 } = {}) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(c.destination);
      const t0 = c.currentTime + start;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    } catch (e) { /* audio not available - fine, fail silently */ }
  }

  return {
    // Warm two-note "sent" chime, played when a customer places an order.
    orderPlaced() {
      tone(587.33, 0, 0.16);
      tone(880, 0.14, 0.22);
    },
    // Bright ascending chime, played on the customer's device when the
    // admin approves their payment.
    orderApproved() {
      tone(523.25, 0, 0.14);
      tone(659.25, 0.12, 0.14);
      tone(783.99, 0.24, 0.3);
    },
    // Short double "ring" used for new-order alerts (admin + supplier inbox).
    newOrder() {
      tone(880, 0, 0.14, { type: 'triangle', gain: 0.22 });
      tone(880, 0.2, 0.14, { type: 'triangle', gain: 0.22 });
    },
    // Gentle confirmation tone for "delivered".
    delivered() {
      tone(660, 0, 0.14);
      tone(990, 0.13, 0.24);
    },
    // Soft blip for message/notification arrival.
    ping() {
      tone(740, 0, 0.12, { gain: 0.14 });
    },
  };
})();
