// Logic for the branded onboarding carousel: a short "loading" splash,
// then swipeable/clickable slides, ending in a choice between creating an
// account or logging in. Whichever way someone leaves this page (Skip, or
// reaching the last slide), we remember it so index.html and nav.js stop
// steering them back here right away.

(function () {
  const TOTAL_SLIDES = 3;
  let current = 0;
  let touchStartX = null;

  function markOnboardingSeen() {
    try {
      localStorage.setItem('vck_onboarding_done', String(Date.now()));
      localStorage.setItem('vck_onboarding_last_shown', String(Date.now()));
    } catch (e) { /* ignore - not the end of the world if this can't be saved */ }
  }

  function goTo(url) {
    markOnboardingSeen();
    window.location.href = url;
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
})();
