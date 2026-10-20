/* Photobooth – app shell: hash router, layout page, onboarding, PWA install. */
(function () {
  'use strict';
  const PB = window.PB;
  const { $, $$, state } = PB;

  const PAGES = ['home', 'layout', 'camera', 'customize', 'download', 'about', 'privacy', 'contact'];
  const TITLES = { layout: 'Choose Layout', camera: 'Camera', customize: 'Decorate', download: 'Download', about: 'About', privacy: 'Privacy Policy', contact: 'Contact' };
  const FLOW = ['layout', 'camera', 'customize', 'download'];
  const BASE_TITLE = 'Photobooth – Every Click Tells a Story';

  /** Everything the renderer needs, taken from the current state. */
  PB.renderOptions = (extra) => Object.assign({
    layout: PB.currentLayout(),
    photos: state.photos,
    frameColor: state.frameColor,
    shape: state.shape,
    filter: state.filter,
    caption: state.caption.trim(),
    showDate: state.showDate,
    dateFormat: state.dateFormat,
    showTagline: state.showTagline,
    taglineText: (state.taglineText || '').trim(),
    strokes: state.strokes,
    stickers: state.stickers,
    idCard: state.idCard,
    includeStickers: true,
    scale: 1,
  }, extra || {});

  /* ---------- Fonts: canvas text needs the web fonts loaded first ---------- */
  PB.fontsReady = (document.fonts && document.fonts.load)
    ? Promise.race([
      Promise.all([document.fonts.load('40px "Patrick Hand"'), document.fonts.load('40px VT323'), document.fonts.load('700 40px Caveat')]),
      PB.sleep(3000), // offline or blocked: fall back to system fonts
    ]).catch(() => {})
    : Promise.resolve();

  /* ---------- Router ---------- */
  PB.go = (page) => {
    if (location.hash === '#/' + page) route();
    else location.hash = '#/' + page;
  };

  function route() {
    let page = (location.hash.replace(/^#\/?/, '') || 'home').split(/[?/]/)[0];
    if (!PAGES.includes(page)) page = 'home';
    if ((page === 'customize' || page === 'download') && PB.filledCount() === 0) {
      if (state.page) PB.toast('Take or upload a photo first 📸');
      page = 'camera';
      history.replaceState(null, '', '#/camera');
    }
    const prev = state.page;
    if (prev === page) return;
    if (prev === 'camera') PB.camera.leave();
    state.page = page;

    $$('.page').forEach((p) => {
      const on = p.dataset.page === page;
      p.hidden = !on;
      p.classList.toggle('active', on);
    });
    $$('.site-nav a').forEach((a) => {
      if (a.dataset.link === page || (a.dataset.link === 'layout' && FLOW.includes(page))) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    updateStepper(page);
    document.body.dataset.page = page;
    document.title = page === 'home' ? BASE_TITLE : `${TITLES[page]} · ${BASE_TITLE}`;
    closeNav();
    window.scrollTo(0, 0);

    if (page === 'layout') renderLayoutCards();
    if (page === 'camera') PB.camera.enter();
    if (page === 'customize') PB.editor.enter();
    if (page === 'download') PB.exporter.enter();

    if (prev) { // move focus to the new page heading for screen readers
      const h = $(`#page-${page} h1`);
      if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }
  }

  function updateStepper(page) {
    const idx = FLOW.indexOf(page);
    $$('.stepper li').forEach((li) => {
      const i = FLOW.indexOf(li.dataset.step);
      li.classList.toggle('done', idx > -1 && i < idx);
      if (i === idx) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }

  /* ---------- Layout page ---------- */
  const CARD_COLORS = ['#ffd6e8', '#e4d9ff', '#d4f5e9', '#fff3c4', '#d6ecff', '#ffe4cc'];
  function renderLayoutCards() {
    const grid = $('#layoutGrid');
    grid.innerHTML = '';
    PB.LAYOUTS.forEach((L, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'card layout-card' + (i % 2 ? ' tilt-r' : ' tilt-l');
      b.dataset.layout = L.id;
      b.setAttribute('aria-pressed', L.id === state.layoutId ? 'true' : 'false');
      const c = document.createElement('canvas');
      const previewH = 170;
      PB.renderStrip(c, {
        layout: L, photos: [], frameColor: CARD_COLORS[i % CARD_COLORS.length], shape: 'rounded', filter: 'none',
        caption: '', showDate: true, dateFormat: 'dots', showTagline: false, strokes: [], stickers: [],
        idCard: state.idCard, includeStickers: false, scale: Math.min(previewH / L.H, 220 / L.W) * 2,
      });
      c.className = 'layout-thumb';
      c.setAttribute('aria-hidden', 'true');
      const wrap = document.createElement('div');
      wrap.className = 'layout-thumb-wrap';
      wrap.appendChild(c);
      b.appendChild(wrap);
      const info = document.createElement('span');
      info.className = 'layout-info';
      info.innerHTML = `<span class="layout-name">${L.name}</span><span class="layout-desc">${L.desc}</span>`;
      b.appendChild(info);
      grid.appendChild(b);
    });
  }
  function initLayoutPage() {
    $('#layoutGrid').addEventListener('click', (e) => {
      const b = e.target.closest('[data-layout]');
      if (!b) return;
      state.layoutId = b.dataset.layout;
      PB.markDirty();
      PB.go('camera');
    });
  }

  /* ---------- Navigation ---------- */
  function closeNav() {
    $('#siteNav').classList.remove('open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
    $('#navToggle').setAttribute('aria-label', 'Open menu');
  }
  function initNav() {
    $('#navToggle').addEventListener('click', () => {
      const open = !$('#siteNav').classList.contains('open');
      $('#siteNav').classList.toggle('open', open);
      $('#navToggle').setAttribute('aria-expanded', String(open));
      $('#navToggle').setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    document.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]');
      if (n) { e.preventDefault(); PB.go(n.dataset.nav); }
    });
    window.addEventListener('hashchange', route);
  }

  /* ---------- Onboarding: What's New + 5-step guide ---------- */
  const SEEN_KEY = 'photobooth-onboarded-v1';
  const GUIDE = [
    { e: '🖼️', t: 'Pick a layout', x: 'Choose a 2, 3 or 4-cut strip, a 2×2 grid, a polaroid or a student ID card.' },
    { e: '📷', t: 'Allow the camera', x: 'Tap “Allow” when your browser asks. No camera? Upload photos from your device instead.' },
    { e: '⏱️', t: 'Strike a pose', x: 'Press Start. A 10‑second countdown and a flash take every shot for you. Retake any photo you don’t love.' },
    { e: '🎀', t: 'Decorate', x: 'Frame colors, photo shapes, filters, stickers, doodles and a caption. On phones, the tools live in the bottom toolbar.' },
    { e: '💌', t: 'Download & share', x: 'Pick a size for posts or stories, then Download or Share. Your photos stay on your device.' },
  ];
  let guideStep = 0;
  function renderGuide() {
    const s = GUIDE[guideStep];
    $('#guideCount').textContent = `Step ${guideStep + 1} of ${GUIDE.length}`;
    $('#guideEmoji').textContent = s.e;
    $('#guideTitle').textContent = s.t;
    $('#guideText').textContent = s.x;
    $('#guideDots').innerHTML = GUIDE.map((_, i) => `<span class="${i === guideStep ? 'on' : ''}"></span>`).join('');
    $('#guidePrev').disabled = guideStep === 0;
    $('#guideNext').textContent = guideStep === GUIDE.length - 1 ? "Let's go ✦" : 'Next';
  }
  function openGuide() {
    guideStep = 0;
    renderGuide();
    PB.openModal('guideModal');
  }
  function initOnboarding() {
    $('#guidePrev').addEventListener('click', () => { if (guideStep > 0) { guideStep--; renderGuide(); } });
    $('#guideNext').addEventListener('click', () => {
      if (guideStep < GUIDE.length - 1) { guideStep++; renderGuide(); }
      else PB.closeModal('guideModal');
    });
    $('#btnStartGuide').addEventListener('click', () => { PB.closeModal('whatsNewModal'); openGuide(); });
    $('#btnOpenGuide').addEventListener('click', openGuide);
    $('#btnOpenNews').addEventListener('click', () => PB.openModal('whatsNewModal'));
    let seen = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { /* private mode */ }
    if (!seen) {
      setTimeout(() => PB.openModal('whatsNewModal'), 700);
      try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* ignore */ }
    }
  }

  /* ---------- Contact form (mailto, no backend) ---------- */
  function initContact() {
    $('#contactForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      const to = $('#contactEmail').textContent.trim();
      const subject = encodeURIComponent('Photobooth feedback from ' + f.name.value.trim());
      const body = encodeURIComponent(f.message.value.trim());
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    });
  }

  /* ---------- PWA ---------- */
  function initPWA() {
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service worker failed:', err));
      });
    }
    let deferred = null;
    const btn = $('#btnInstall');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
    });
    btn.addEventListener('click', async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* ignore */ }
      deferred = null;
      btn.hidden = true;
    });
    window.addEventListener('appinstalled', () => { btn.hidden = true; PB.toast('Installed! Find Photobooth on your home screen ✨'); });
  }

  /* ---------- Reset ---------- */
  PB.resetSession = function () {
    Object.assign(state, { photos: [], stickers: [], strokes: [], caption: '' });
    PB.markDirty();
    PB.editor.reset();
    PB.exporter.reset();
    PB.go('layout');
  };

  /* ---------- Instagram / Facebook in-app browser banner ---------- */
  function initInAppBanner() {
    if (!PB.isInAppBrowser()) return;
    const banner = $('#inAppBanner');
    banner.hidden = false;
    $('#btnInAppClose').addEventListener('click', () => { banner.hidden = true; });
  }

  /* ---------- Boot ---------- */
  function boot() {
    initInAppBanner();
    initNav();
    initLayoutPage();
    PB.camera.init();
    PB.editor.init();
    PB.exporter.init();
    initOnboarding();
    initContact();
    initPWA();
    route();
    // Re-draw canvas text once the web fonts arrive.
    PB.fontsReady.then(() => {
      if (state.page === 'layout') renderLayoutCards();
      if (state.page === 'customize') PB.editor.render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
