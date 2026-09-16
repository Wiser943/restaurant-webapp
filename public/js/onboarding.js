// Logic for the branded onboarding carousel: a short "loading" splash,
// then swipeable/clickable slides, ending in a choice between creating an
// account or logging in. Whichever way someone leaves this page (Skip, or
// reaching the last slide), we remember it so index.html and nav.js stop
// steering them back here right away.

(function () {
  // If we're back here after redirectWithWarmupRefresh() reloaded the page
  // (see below), finish the trip immediately instead of showing the splash
  // and slides again.
  try {
    const pending = sessionStorage.getItem('vck_warmup_redirect_target');
    if (pending) {
      sessionStorage.removeItem('vck_warmup_redirect_target');
      window.location.replace(pending);
      return; // navigating away - don't run the rest of this file
    }
  } catch (e) { /* ignore - storage unavailable, just fall through normally */ }

  const TOTAL_SLIDES = 3;
  let current = 0;
  let touchStartX = null;

  function markOnboardingSeen() {
    try {
      localStorage.setItem('vck_onboarding_done', String(Date.now()));
      localStorage.setItem('vck_onboarding_last_shown', String(Date.now()));
    } catch (e) { /* ignore - not the end of the world if this can't be saved */ }
  }

  // ------------------------------------------------------------------
  // Vercel serverless "cold start" workaround
  // ------------------------------------------------------------------
  // On some Vercel deployments, the first request after a period of
  // inactivity can hit a serverless function before it's warmed up and
  // come back broken (500s, empty responses). Reloading this page once -
  // and pinging /api/health while we're at it - gives the function a
  // moment to spin up before we actually navigate to a page that depends
  // on it (login/signup both call /api/auth/me on load).
  //
  // This is a band-aid, not a real fix. The real fix is either a Vercel
  // plan with fewer cold starts, or a scheduled ping to /api/health to
  // keep the function warm. Once that's sorted, set this to `false` to
  // turn the extra reload off and go back to a plain redirect.
  const REFRESH_ONCE_BEFORE_REDIRECT = true;

  function redirectWithWarmupRefresh(url) {
    try {
      sessionStorage.setItem('vck_warmup_redirect_target', url);
    } catch (e) {
      window.location.href = url; // no sessionStorage available - just go
      return;
    }
    fetch('/api/health').catch(() => { /* ignore - this is just a warm-up ping */ });
    window.location.reload();
  }

  function goTo(url) {
    markOnboardingSeen();
    if (REFRESH_ONCE_BEFORE_REDIRECT) {
      redirectWithWarmupRefresh(url);
    } else {
      window.location.href = url;
    }
  }

  // ---- Splash -> slides ----
  function revealSlides() {
    const splash = document.getElementById('onboard-splash');
    splash.classList.add('onboard-fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      const slides = document.getElementById('onboard-slides');
      slides.style.display = 'flex';
      requestAnimationFrame(() => slides.classList.add('show'));
    }, 350);
  }
  setTimeout(revealSlides, 1500);

  // ---- Slide rendering ----
  function renderSlide() {
    const track = document.getElementById('onboard-track');
    track.style.transform = `translateX(-${current * 100}%)`;

    document.querySelectorAll('.onboard-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === current);
    });

    const isLast = current === TOTAL_SLIDES - 1;
    document.getElementById('onboard-cta-mid').style.display = isLast ? 'none' : 'flex';
    document.getElementById('onboard-cta-final').style.display = isLast ? 'flex' : 'none';
  }

  function nextSlide() {
    if (current < TOTAL_SLIDES - 1) {
      current += 1;
      renderSlide();
    }
  }

  // ---- Controls ----
  document.getElementById('onboard-next').addEventListener('click', nextSlide);
  document.getElementById('onboard-skip').addEventListener('click', () => goTo('login.html'));
  document.getElementById('onboard-signup').addEventListener('click', () => goTo('signup.html'));
  document.getElementById('onboard-login').addEventListener('click', () => goTo('login.html'));

  document.querySelectorAll('.onboard-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      current = Number(dot.dataset.index);
      renderSlide();
    });
  });

  // ---- Swipe support ----
  const track = document.getElementById('onboard-track');
  track.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) < 40) return; // too small to count as a swipe
    if (delta < 0 && current < TOTAL_SLIDES - 1) { current += 1; renderSlide(); }
    else if (delta > 0 && current > 0) { current -= 1; renderSlide(); }
  }, { passive: true });

  renderSlide();

  // The browser only fires beforeinstallprompt for a page that's actually
  // installable, which requires an active service worker. nav.js registers
  // this on every other page; onboarding.html doesn't load nav.js, so do it
  // here too.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* not critical if this fails */ });
    });
  }

  // ------------------------------------------------------------------
  // "Install" button (top right, next to Skip)
  // ------------------------------------------------------------------
  // Chrome/Android normally decide on their own when to show the native
  // mini-infobar/menu-item for installing. We instead capture that event
  // ourselves and fire it the moment the person taps OUR button, so it's
  // available up front rather than waiting on the browser's own timing.
  let deferredInstallPrompt = null;
  const installBtn = document.getElementById('onboard-install');

  function isStandaloneApp() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function alreadyInstalled() {
    try { return localStorage.getItem('vck_install_done') === '1'; } catch (e) { return false; }
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // stop the browser's own mini-infobar
    deferredInstallPrompt = e;
    if (installBtn && !isStandaloneApp() && !alreadyInstalled()) {
      installBtn.style.display = 'inline-flex';
    }
  });

  window.addEventListener('appinstalled', () => {
    try { localStorage.setItem('vck_install_done', '1'); } catch (e) { /* ignore */ }
    if (installBtn) installBtn.style.display = 'none';
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return; // nothing to prompt yet (or unsupported browser)
      installBtn.disabled = true;
      deferredInstallPrompt.prompt();
      try {
        const { outcome } = await deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          try { localStorage.setItem('vck_install_done', '1'); } catch (e) { /* ignore */ }
          installBtn.style.display = 'none';
        }
      } catch (e) { /* ignore */ }
      deferredInstallPrompt = null;
      installBtn.disabled = false;
    });
  }
})();
