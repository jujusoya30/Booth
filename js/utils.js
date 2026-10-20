/* Photobooth – shared helpers + app state.
   Everything lives on window.PB so the plain <script> files can share it
   (no build step, works on any static host). */
(function () {
  'use strict';
  const PB = (window.PB = window.PB || {});

  /* ---------- DOM ---------- */
  PB.$ = (sel, root = document) => root.querySelector(sel);
  PB.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  PB.clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  PB.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- ID card numbers ---------- */
  /** Random school ID number, 5 to 10 digits long (first digit is never 0). */
  const randomCode = () => {
    const len = 5 + Math.floor(Math.random() * 6); // 5, 6, 7, 8, 9 or 10 digits
    let s = String(1 + Math.floor(Math.random() * 9));
    while (s.length < len) s += Math.floor(Math.random() * 10);
    return s;
  };
  /** New random ID number, never the same as `prev`. */
  PB.newIdCode = (prev) => { let c; do { c = randomCode(); } while (c === prev); return c; };

  /* ---------- App state (single source of truth) ---------- */
  PB.state = {
    page: null,
    layoutId: 'strip4',
    photos: [],            // HTMLCanvasElement per slot (null = empty)
    frameColor: '#ffd6e8',
    shape: 'square',
    filter: 'none',
    caption: '',
    showDate: true,
    dateFormat: 'dots',
    showTagline: true,
    taglineText: 'Every Click Tells a Story', // small bottom caption, editable
    stickers: [],          // {id, emoji, x, y, size, rot, flip} in layout units
    strokes: [],           // {mode, color, size, points:[[x,y]]} in layout units
    doodle: { mode: 'pen', color: '#ff6fae', size: 8 },
    timer: 10,             // seconds of countdown before each shot
    sound: true,
    exportSize: 'original',
    exportFormat: 'png',
    exportBg: '#fff0f6',
    idCard: {              // Student ID layout; everything is editable in Decorate → Text
      header: '>> PHOTOBOOTH ACADEMY :',
      fields: [            // empty values fall back to the defaults in PB.idCardValues
        { label: 'NAME', value: '' },
        { label: 'SCHOOL', value: 'PHOTOBOOTH ACADEMY' },
        { label: 'ID NO.', value: randomCode() }, // changes with every new photo
        { label: 'DATE OF BIRTH', value: '' },
        { label: 'COLOR CODE', value: '' },
      ],
      codeAuto: true,      // false once the user types their own number
      signature: true,
    },
    version: 0,            // bumped on every edit, used to cache exports
  };

  PB.markDirty = () => { PB.state.version++; };

  /* ---------- Colors ---------- */
  PB.hslToHex = function (h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const hex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
    return '#' + hex(f(0)) + hex(f(8)) + hex(f(4));
  };
  PB.hexToRgb = function (hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  PB.rgbToHex = ({ r, g, b }) =>
    '#' + [r, g, b].map((v) => Math.round(PB.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  PB.mix = (a, b, t) => {
    const A = PB.hexToRgb(a), B = PB.hexToRgb(b);
    return PB.rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
  };
  PB.rgba = (hex, a) => { const { r, g, b } = PB.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };
  PB.hexToHsl = (hex) => {
    const { r, g, b } = PB.hexToRgb(hex);
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
      else if (max === G) h = (B - R) / d + 2;
      else h = (R - G) / d + 4;
      h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
  };
  PB.luminance = (hex) => {
    const { r, g, b } = PB.hexToRgb(hex);
    const c = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  /** Text color with the best contrast on top of `hex`. */
  PB.inkFor = (hex) => (PB.luminance(hex) > 0.28 ? '#4a3b5c' : '#ffffff');

  /* 100+ frame colors: a hue × tone grid plus neutrals and pastel favorites. */
  PB.FRAME_COLORS = (function () {
    const favorites = ['#ffd6e8', '#e4d9ff', '#d4f5e9', '#fff3c4', '#d6ecff', '#ffe4cc', '#ffffff', '#fffaf0',
      '#fdf6e3', '#f5e6d3', '#cfc8d8', '#8e8699', '#4a3b5c', '#2b2433', '#000000'];
    const hues = [0, 15, 30, 45, 60, 90, 120, 150, 175, 195, 215, 240, 265, 290, 315, 340];
    const tones = [[100, 94], [90, 87], [80, 79], [70, 68], [60, 55], [50, 38]];
    const grid = [];
    tones.forEach(([s, l]) => hues.forEach((h) => grid.push(PB.hslToHex(h, s, l))));
    return Array.from(new Set(favorites.concat(grid)));
  })();

  /* ---------- Dates ---------- */
  PB.isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  PB.formatDate = (d, fmt) => {
    const y = d.getFullYear(), m = pad(d.getMonth() + 1), day = pad(d.getDate());
    if (fmt === 'long') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (fmt === 'iso') return `${y}.${m}.${day}`;
    return `${m}.${day}.${y}`;
  };

  /* ---------- Device detection ---------- */
  PB.isIOS = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  /** Instagram and Facebook (incl. Messenger) in-app browsers block downloads. */
  PB.isInAppBrowser = () => /Instagram|FBAN|FBAV/i.test(navigator.userAgent);

  /* ---------- Toast ---------- */
  let toastTimer;
  PB.toast = function (msg, ms = 2800) {
    const el = PB.$('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  };

  /* ---------- Modals (accessible, no <dialog> needed for older iOS) ---------- */
  const modalStack = [];
  PB.openModal = function (id) {
    const m = document.getElementById(id);
    if (!m || !m.hidden) return;
    modalStack.push({ m, lastFocus: document.activeElement });
    m.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => m.classList.add('open'));
    const focusable = m.querySelector('.modal-actions .btn-primary, .modal-actions button, button, [href], input');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  };
  PB.closeModal = function (id) {
    const idx = modalStack.findIndex((x) => x.m.id === id);
    if (idx === -1) return;
    const { m, lastFocus } = modalStack.splice(idx, 1)[0];
    m.classList.remove('open');
    m.hidden = true;
    if (!modalStack.length) document.body.classList.remove('modal-open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    m.dispatchEvent(new CustomEvent('modalclose'));
  };
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    const modal = e.target.closest('.modal');
    if (closer && modal) PB.closeModal(modal.id);
    else if (modal && e.target === modal) PB.closeModal(modal.id); // backdrop click
  });
  document.addEventListener('keydown', (e) => {
    const top = modalStack[modalStack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') { PB.closeModal(top.m.id); return; }
    if (e.key === 'Tab') { // simple focus trap
      const f = PB.$$('button, [href], input, select, textarea', top.m).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    }
  });

  /* ---------- Images ---------- */
  /** Reads an image File into a canvas (EXIF orientation is applied by modern browsers). */
  PB.fileToCanvas = function (file, maxDim = 1600) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * s));
        c.height = Math.max(1, Math.round(img.naturalHeight * s));
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  };

  PB.canvasToBlob = (canvas, type = 'image/png', quality = 0.92) =>
    new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, quality);
      } else { // very old browsers
        const data = atob(canvas.toDataURL(type, quality).split(',')[1]);
        const arr = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) arr[i] = data.charCodeAt(i);
        resolve(new Blob([arr], { type }));
      }
    });

  PB.blobToDataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });

  PB.formatBytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

  /** Draws `img` into the box using "object-fit: cover". */
  PB.drawCover = function (ctx, img, x, y, w, h, zoom = 1) {
    const iw = img.width, ih = img.height;
    const s = Math.max(w / iw, h / ih) * zoom;
    const sw = w / s, sh = h / s;
    ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
  };

  /** Small deterministic PRNG so decorations look the same on every export. */
  PB.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------- Sound (tiny Web Audio beeps, no files) ---------- */
  let audioCtx = null;
  PB.unlockAudio = function () {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { /* ignore */ }
  };
  PB.beep = function (freq = 880, dur = 0.08) {
    if (!PB.state.sound || !audioCtx) return;
    try {
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  };
})();
