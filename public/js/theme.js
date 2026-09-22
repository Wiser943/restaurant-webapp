// ============================================================
// VC Kitchen — light/dark theme toggle
// Shared by the customer, admin and rider (vendor) panels, all served
// from the same origin, so one localStorage key keeps them all in sync.
// The tiny inline snippet in each page's <head> applies the saved theme
// before first paint (no flash); this file owns the toggle button and
// keeps things in sync if the user has multiple tabs/panels open.
// ============================================================
(function () {
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#fbf5ec' : '#16120e');
  }

  window.Theme = {
    get: function () {
      try { return localStorage.getItem('vck_theme') || 'dark'; } catch (e) { return 'dark'; }
    },
    set: function (theme) {
      try { localStorage.setItem('vck_theme', theme); } catch (e) { /* ignore */ }
      apply(theme);
    },
    toggle: function () {
      window.Theme.set(window.Theme.get() === 'light' ? 'dark' : 'light');
    },
    init: function () { apply(window.Theme.get()); }
  };

  window.Theme.init();

  // Event delegation: any element with [data-theme-toggle] toggles the theme.
  // This means nav-rendering code just has to add the attribute to a button -
  // no per-page listener wiring needed.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (btn) window.Theme.toggle();
  });

  // Keep every open tab/panel (e.g. admin in one tab, customer site in another)
  // in sync if the theme is changed elsewhere.
  window.addEventListener('storage', function (e) {
    if (e.key === 'vck_theme') apply(e.newValue || 'dark');
  });
})();
