/* Photobooth – customize page: frame colors, shapes, filters, stickers,
   doodles, captions, layout switching and photo reordering.
   Stickers and doodles use Pointer Events so mouse, touch and stylus all work. */
(function () {
  'use strict';
  const PB = window.PB;
  const { $, $$, state } = PB;
  const ed = (PB.editor = {});

  const STICKERS = ['💖', '💕', '💗', '❤️', '💜', '💙', '✨', '⭐', '🌟', '💫', '🌸', '🌷', '🌼', '🌻', '🍀', '🦋',
    '🐰', '🐱', '🐶', '🧸', '🐻', '🎀', '👑', '💎', '💌', '🍓', '🍒', '🍑', '🧁', '🍰', '🍭', '🌈',
    '☁️', '🌙', '☀️', '🎉', '🎈', '📸', '💋', '😎', '🥰', '😜', '👀', '🔥', '💯', '🎧', '⚡', '🍬'];
  const PEN_COLORS = ['#ff6fae', '#ff4d6d', '#ff9f43', '#ffd93d', '#6bcB77', '#4d96ff', '#9b5de5', '#4a3b5c', '#ffffff', '#000000'];

  let canvas, wrap, stickerLayer, doodleLayer;
  let scale = 1;
  let selectedId = null;
  let idSeq = 0;
  let rafPending = false;
  let doodleOn = false;
  let currentTab = 'frame';

  ed.init = function () {
    canvas = $('#previewCanvas');
    wrap = $('#previewWrap');
    stickerLayer = $('#stickerLayer');
    doodleLayer = $('#doodleLayer');
    buildTabs();
    buildFrame();
    buildShapes();
    buildFilters();
    buildStickers();
    buildDoodle();
    buildText();
    buildIdPanel();
    buildPhotos();
    initStickerGestures();
    initDoodleGestures();

    const refit = () => { if (state.page === 'customize') ed.fit(); };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    if ('ResizeObserver' in window) new ResizeObserver(refit).observe($('#previewBox'));
  };

  let idTabShown = false;
  ed.enter = function () {
    // First time decorating an ID card: open the Text tab so the fields are right there.
    if (PB.currentLayout().theme === 'idcard' && !idTabShown) { currentTab = 'text'; idTabShown = true; }
    syncControls();
    ed.fit();
    ed.render();
    renderPhotoList();
    renderFilterThumbs();
  };

  /** Preview renders at 1x layout size; CSS scales it to fit the screen. */
  ed.render = function () {
    PB.renderStrip(canvas, PB.renderOptions({ scale: 1, includeStickers: false }));
  };
  ed.requestRender = function () {
    PB.markDirty();
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; ed.render(); });
  };

  ed.fit = function () {
    const L = PB.currentLayout();
    const box = $('#previewBox');
    const availW = Math.max(120, box.clientWidth - 8);
    const vw = window.innerWidth;
    // phone: sticky preview above tools; tablet: stacked; desktop: side by side
    const maxH = window.innerHeight * (vw < 600 ? 0.44 : vw < 900 ? 0.6 : 0.74);
    const sc = Math.max(0.05, Math.min(availW / L.W, maxH / L.H, 1.2));
    const w = Math.round(L.W * sc), h = Math.round(L.H * sc);
    if (Math.abs(sc - scale) < 0.0005 && wrap.style.width === w + 'px') return;
    scale = sc;
    wrap.style.width = w + 'px';
    wrap.style.height = h + 'px';
    renderStickers();
  };

  /* ================= Tabs ================= */
  function buildTabs() {
    const tabs = $$('.tool-tab');
    tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));
    $('.tool-tabs').addEventListener('keydown', (e) => {
      const i = tabs.findIndex((t) => t.dataset.tab === currentTab);
      let j = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') j = 0;
      if (e.key === 'End') j = tabs.length - 1;
      if (j >= 0) { e.preventDefault(); selectTab(tabs[j].dataset.tab); tabs[j].focus(); }
    });
  }
  function selectTab(id) {
    currentTab = id;
    $$('.tool-tab').forEach((t) => {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    $$('.tool-panel').forEach((p) => { p.hidden = p.id !== 'panel-' + id; });
    setDoodle(id === 'doodle');
    if (id === 'filter') renderFilterThumbs();
    if (id === 'photos') renderPhotoList();
  }

  /* ================= Frame color ================= */
  function buildFrame() {
    const grid = $('#swatches');
    const frag = document.createDocumentFragment();
    PB.FRAME_COLORS.forEach((hex) => frag.appendChild(swatch(hex, `Frame color ${hex}`)));
    grid.appendChild(frag);
    $('#colorCount').textContent = `${PB.FRAME_COLORS.length} colors`;
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (b) setFrameColor(b.dataset.color);
    });
    $('#customColor').addEventListener('input', (e) => setFrameColor(e.target.value));
  }
  function swatch(hex, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = hex;
    b.dataset.color = hex;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', 'false');
    b.title = hex;
    return b;
  }
  PB.makeSwatch = swatch;
  function setFrameColor(hex) {
    state.frameColor = hex.toLowerCase();
    markPressed($('#swatches'), '.swatch', (s) => s.dataset.color === state.frameColor);
    $('#customColor').value = state.frameColor;
    ed.requestRender();
  }
  function markPressed(root, sel, fn) {
    $$(sel, root).forEach((el) => el.setAttribute('aria-pressed', fn(el) ? 'true' : 'false'));
  }

  /* ================= Shapes ================= */
  function buildShapes() {
    const box = $('#shapeOptions');
    PB.SHAPES.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt opt-tile';
      b.dataset.shape = s.id;
      b.innerHTML = `<span class="opt-icon" aria-hidden="true">${s.icon}</span><span>${s.name}</span>`;
      box.appendChild(b);
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-shape]');
      if (!b) return;
      state.shape = b.dataset.shape;
      markPressed(box, '[data-shape]', (x) => x.dataset.shape === state.shape);
      ed.requestRender();
    });
  }

  /* ================= Filters ================= */
  function buildFilters() {
    const box = $('#filterOptions');
    PB.FILTERS.forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt opt-tile filter-opt';
      b.dataset.filter = f.id;
      b.innerHTML = `<canvas width="96" height="72" aria-hidden="true"></canvas><span>${f.name}</span>`;
      box.appendChild(b);
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      state.filter = b.dataset.filter;
      markPressed(box, '[data-filter]', (x) => x.dataset.filter === state.filter);
      ed.requestRender();
    });
  }
  function renderFilterThumbs() {
    const src = state.photos.find(Boolean);
    const small = document.createElement('canvas');
    small.width = 96; small.height = 72;
    const sctx = small.getContext('2d');
    if (src) PB.drawCover(sctx, src, 0, 0, 96, 72);
    else { sctx.fillStyle = '#f3c6dc'; sctx.fillRect(0, 0, 96, 72); }
    $$('.filter-opt').forEach((b) => {
      const c = b.querySelector('canvas');
      c.getContext('2d').drawImage(PB.applyFilter(small, b.dataset.filter), 0, 0);
    });
  }

  /* ================= Stickers ================= */
  function buildStickers() {
    const box = $('#stickerPicker');
    STICKERS.forEach((emo) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sticker-pick';
      b.textContent = emo;
      b.setAttribute('aria-label', `Add sticker ${emo}`);
      box.appendChild(b);
    });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.sticker-pick');
      if (b) addSticker(b.textContent);
    });
    $('#btnClearStickers').addEventListener('click', () => {
      if (!state.stickers.length) return;
      state.stickers = [];
      selectedId = null;
      renderStickers();
      PB.markDirty();
    });
  }

  function addSticker(emoji) {
    const L = PB.currentLayout();
    const st = {
      id: ++idSeq,
      emoji,
      x: L.W / 2 + (Math.random() - 0.5) * L.W * 0.3,
      y: L.H / 2 + (Math.random() - 0.5) * L.H * 0.2,
      size: Math.round(Math.min(L.W, L.H) * 0.26),
      rot: (Math.random() - 0.5) * 0.4,
      flip: false,
    };
    state.stickers.push(st);
    selectedId = st.id;
    renderStickers();
    PB.markDirty();
    if (window.innerWidth < 600) $('#previewBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function findSticker(id) { return state.stickers.find((s) => s.id === id); }
  function stickerEl(id) { return stickerLayer.querySelector(`.sticker[data-id="${id}"]`); }

  function renderStickers() {
    stickerLayer.innerHTML = '';
    for (const st of state.stickers) {
      const el = document.createElement('div');
      el.className = 'sticker' + (st.id === selectedId ? ' selected' : '');
      el.dataset.id = st.id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Sticker ${st.emoji}. Drag to move. Arrow keys move, plus or minus resize, R rotates, F flips, Delete removes.`);
      el.innerHTML =
        '<span class="st-emoji" aria-hidden="true"></span>' +
        '<button type="button" class="st-ctrl st-del" data-act="del" aria-label="Delete sticker">✕</button>' +
        '<button type="button" class="st-ctrl st-flip" data-act="flip" aria-label="Flip sticker">⇆</button>' +
        '<button type="button" class="st-ctrl st-handle" data-act="handle" aria-label="Resize and rotate. Drag this handle.">↻</button>';
      el.firstChild.textContent = st.emoji;
      positionSticker(el, st);
      stickerLayer.appendChild(el);
    }
    stickerLayer.classList.toggle('has-selection', selectedId != null);
  }

  function positionSticker(el, st) {
    const px = st.size * scale;
    el.style.left = st.x * scale + 'px';
    el.style.top = st.y * scale + 'px';
    el.style.width = px + 'px';
    el.style.height = px + 'px';
    el.style.transform = `translate(-50%, -50%) rotate(${st.rot}rad)`;
    const emo = el.firstChild;
    emo.style.fontSize = px + 'px';
    emo.style.transform = st.flip ? 'scaleX(-1)' : '';
  }

  function select(id) {
    selectedId = id;
    $$('.sticker', stickerLayer).forEach((el) => el.classList.toggle('selected', +el.dataset.id === id));
    stickerLayer.classList.toggle('has-selection', id != null);
  }

  function removeSticker(id) {
    state.stickers = state.stickers.filter((s) => s.id !== id);
    if (selectedId === id) selectedId = null;
    renderStickers();
    PB.markDirty();
  }

  function clampSticker(st) {
    const L = PB.currentLayout();
    st.x = PB.clamp(st.x, 0, L.W);
    st.y = PB.clamp(st.y, 0, L.H);
    st.size = PB.clamp(st.size, 20, Math.max(L.W, L.H));
  }

  function initStickerGestures() {
    const pointers = new Map(); // pointerId -> {x, y}
    let g = null;               // active gesture

    const pts = () => Array.from(pointers.values());

    function startDrag(st, p) {
      g = { mode: 'drag', id: st.id, px: p.x, py: p.y, x: st.x, y: st.y };
    }
    function startPinch(st) {
      const [a, b] = pts();
      g = {
        mode: 'pinch', id: st.id,
        dist: Math.hypot(b.x - a.x, b.y - a.y) || 1,
        ang: Math.atan2(b.y - a.y, b.x - a.x),
        mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2,
        size: st.size, rot: st.rot, x: st.x, y: st.y,
      };
    }
    function startHandle(st, p) {
      const r = stickerLayer.getBoundingClientRect();
      const cx = r.left + st.x * scale, cy = r.top + st.y * scale;
      g = {
        mode: 'handle', id: st.id, cx, cy,
        dist: Math.hypot(p.x - cx, p.y - cy) || 1,
        ang: Math.atan2(p.y - cy, p.x - cx),
        size: st.size, rot: st.rot,
      };
    }

    stickerLayer.addEventListener('pointerdown', (e) => {
      const ctrl = e.target.closest('.st-ctrl');
      if (ctrl && ctrl.dataset.act !== 'handle') return; // del/flip handled on click
      const el = e.target.closest('.sticker');
      const p = { x: e.clientX, y: e.clientY };

      // Second finger anywhere on the layer turns a drag into a pinch.
      if (!el) {
        if (g && g.mode === 'drag' && pointers.size === 1) {
          e.preventDefault();
          pointers.set(e.pointerId, p);
          stickerLayer.setPointerCapture(e.pointerId);
          startPinch(findSticker(g.id));
        } else if (pointers.size === 0) {
          select(null);
        }
        return;
      }

      e.preventDefault();
      const st = findSticker(+el.dataset.id);
      if (!st) return;
      if (selectedId !== st.id) select(st.id);
      pointers.set(e.pointerId, p);
      try { stickerLayer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (ctrl) startHandle(st, p);
      else if (pointers.size === 1) startDrag(st, p);
      else if (pointers.size === 2) startPinch(st);
    });

    stickerLayer.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !g) return;
      e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const st = findSticker(g.id);
      if (!st) return;
      if (g.mode === 'drag') {
        st.x = g.x + (e.clientX - g.px) / scale;
        st.y = g.y + (e.clientY - g.py) / scale;
      } else if (g.mode === 'handle') {
        const d = Math.hypot(e.clientX - g.cx, e.clientY - g.cy);
        st.size = g.size * (d / g.dist);
        st.rot = g.rot + (Math.atan2(e.clientY - g.cy, e.clientX - g.cx) - g.ang);
      } else if (g.mode === 'pinch' && pointers.size >= 2) {
        const [a, b] = pts();
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        st.size = g.size * (d / g.dist);
        st.rot = g.rot + (Math.atan2(b.y - a.y, b.x - a.x) - g.ang);
        st.x = g.x + ((a.x + b.x) / 2 - g.mx) / scale;
        st.y = g.y + ((a.y + b.y) / 2 - g.my) / scale;
      }
      clampSticker(st);
      const el = stickerEl(st.id);
      if (el) positionSticker(el, st);
      PB.markDirty();
    });

    const end = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (!g) return;
      const st = findSticker(g.id);
      if (pointers.size === 1 && st) {
        const [p] = pts();
        startDrag(st, p); // keep dragging with the remaining finger
      } else if (pointers.size === 0) {
        g = null;
      }
    };
    stickerLayer.addEventListener('pointerup', end);
    stickerLayer.addEventListener('pointercancel', end);

    stickerLayer.addEventListener('click', (e) => {
      const ctrl = e.target.closest('.st-ctrl');
      if (!ctrl) return;
      const el = ctrl.closest('.sticker');
      const st = findSticker(+el.dataset.id);
      if (!st) return;
      if (ctrl.dataset.act === 'del') removeSticker(st.id);
      if (ctrl.dataset.act === 'flip') { st.flip = !st.flip; positionSticker(el, st); PB.markDirty(); }
    });

    stickerLayer.addEventListener('focusin', (e) => {
      const el = e.target.closest('.sticker');
      if (el) select(+el.dataset.id);
    });

    // Keyboard controls for accessibility
    stickerLayer.addEventListener('keydown', (e) => {
      const el = e.target.closest('.sticker');
      if (!el || e.target !== el) return;
      const st = findSticker(+el.dataset.id);
      if (!st) return;
      const step = e.shiftKey ? 40 : 10;
      let handled = true;
      switch (e.key) {
        case 'ArrowLeft': st.x -= step; break;
        case 'ArrowRight': st.x += step; break;
        case 'ArrowUp': st.y -= step; break;
        case 'ArrowDown': st.y += step; break;
        case '+': case '=': st.size *= 1.1; break;
        case '-': case '_': st.size /= 1.1; break;
        case 'r': st.rot += Math.PI / 12; break;
        case 'R': st.rot -= Math.PI / 12; break;
        case 'f': case 'F': st.flip = !st.flip; break;
        case 'Delete': case 'Backspace': removeSticker(st.id); e.preventDefault(); return;
        case 'Escape': select(null); el.blur(); break;
        default: handled = false;
      }
      if (handled) { e.preventDefault(); clampSticker(st); positionSticker(el, st); PB.markDirty(); }
    });
  }

  /* ================= Doodle ================= */
  function buildDoodle() {
    const colors = $('#doodleColors');
    PEN_COLORS.forEach((hex) => colors.appendChild(swatch(hex.toLowerCase(), `Pen color ${hex}`)));
    colors.addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (b) setPenColor(b.dataset.color);
    });
    $('#doodleCustom').addEventListener('input', (e) => setPenColor(e.target.value));
    $('#brushSize').addEventListener('input', (e) => {
      state.doodle.size = +e.target.value;
      $('#brushOut').textContent = e.target.value;
    });
    $$('[data-dmode]').forEach((b) => b.addEventListener('click', () => {
      state.doodle.mode = b.dataset.dmode;
      $$('[data-dmode]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    }));
    $('#btnDoodleToggle').addEventListener('click', () => setDoodle(!doodleOn));
    $('#btnUndo').addEventListener('click', () => { state.strokes.pop(); ed.requestRender(); });
    $('#btnClearDoodle').addEventListener('click', () => {
      if (!state.strokes.length) return;
      if (window.confirm('Clear all doodles?')) { state.strokes = []; ed.requestRender(); }
    });
    setPenColor(state.doodle.color);
  }
  function setPenColor(hex) {
    state.doodle.color = hex.toLowerCase();
    state.doodle.mode = 'pen';
    $$('[data-dmode]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.dmode === 'pen' ? 'true' : 'false'));
    markPressed($('#doodleColors'), '.swatch', (s) => s.dataset.color === state.doodle.color);
    $('#doodleCustom').value = state.doodle.color;
  }
  function setDoodle(on) {
    doodleOn = on;
    doodleLayer.hidden = !on;
    wrap.classList.toggle('doodling', on);
    const t = $('#btnDoodleToggle');
    t.setAttribute('aria-pressed', on ? 'true' : 'false');
    t.textContent = on ? '✏️ Drawing on' : '✋ Drawing off';
    if (on) select(null);
  }

  function initDoodleGestures() {
    let drawingId = null;
    let stroke = null;
    const toLayout = (ev) => {
      const r = doodleLayer.getBoundingClientRect();
      return [Math.round(((ev.clientX - r.left) / scale) * 10) / 10, Math.round(((ev.clientY - r.top) / scale) * 10) / 10];
    };
    doodleLayer.addEventListener('pointerdown', (e) => {
      if (drawingId !== null) return; // one finger draws; ignore extra touches
      e.preventDefault();
      drawingId = e.pointerId;
      try { doodleLayer.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const d = state.doodle;
      stroke = { mode: d.mode, color: d.color, size: d.mode === 'eraser' ? d.size * 2 : d.size, points: [toLayout(e)] };
      state.strokes.push(stroke);
      ed.requestRender();
    });
    doodleLayer.addEventListener('pointermove', (e) => {
      if (e.pointerId !== drawingId || !stroke) return;
      e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      (evs.length ? evs : [e]).forEach((ev) => stroke.points.push(toLayout(ev)));
      ed.requestRender();
    });
    const end = (e) => {
      if (e.pointerId !== drawingId) return;
      drawingId = null;
      stroke = null;
    };
    doodleLayer.addEventListener('pointerup', end);
    doodleLayer.addEventListener('pointercancel', end);
  }

  /* ================= Text ================= */
  function buildText() {
    $('#captionInput').addEventListener('input', (e) => { state.caption = e.target.value; ed.requestRender(); });
    $('#dateToggle').addEventListener('change', (e) => { state.showDate = e.target.checked; ed.requestRender(); });
    $('#dateFormat').addEventListener('change', (e) => { state.dateFormat = e.target.value; ed.requestRender(); });
    $('#taglineToggle').addEventListener('change', (e) => {
      state.showTagline = e.target.checked;
      $('#taglineInput').disabled = !state.showTagline;
      ed.requestRender();
    });
    $('#taglineInput').addEventListener('input', (e) => { state.taglineText = e.target.value; ed.requestRender(); });
    // Show real example dates in the dropdown
    const now = new Date();
    $$('#dateFormat option').forEach((o) => { o.textContent = PB.formatDate(now, o.value); });
  }

  /* ================= Student ID card details ================= */
  const ID_PLACEHOLDERS = ['YOUR NAME', 'School or team', '5–10 digit number', 'Today: YYYY - MM - DD', 'Auto: frame color'];

  function buildIdPanel() {
    const rows = $('#idRows');
    state.idCard.fields.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'id-row';
      row.innerHTML =
        `<input type="text" class="id-label" data-i="${i}" maxlength="16" autocomplete="off" aria-label="Label for line ${i + 1}">` +
        `<input type="text" class="id-value" data-i="${i}" maxlength="24" autocomplete="off" placeholder="${ID_PLACEHOLDERS[i] || ''}">` +
        (i === 2 ? '<button type="button" class="btn btn-icon" id="btnIdDice" aria-label="New random ID number" title="New random ID number">🎲</button>' : '');
      rows.appendChild(row);
    });
    rows.addEventListener('input', (e) => {
      const t = e.target;
      if (!t.dataset || t.dataset.i == null) return;
      const i = +t.dataset.i;
      const f = state.idCard.fields[i];
      if (t.classList.contains('id-label')) {
        f.label = t.value;
        t.nextElementSibling.setAttribute('aria-label', `${t.value || 'Line ' + (i + 1)} value`);
      } else {
        f.value = t.value;
        if (i === 2) state.idCard.codeAuto = false; // keep the number the user typed
      }
      ed.requestRender();
    });
    rows.addEventListener('click', (e) => {
      if (!e.target.closest('#btnIdDice')) return;
      const card = state.idCard;
      card.fields[2].value = PB.newIdCode(card.fields[2].value);
      card.codeAuto = true; // new photos get new numbers again
      syncIdPanel();
      ed.requestRender();
    });
    $('#idHeader').addEventListener('input', (e) => { state.idCard.header = e.target.value; ed.requestRender(); });
    $('#idSignature').addEventListener('change', (e) => { state.idCard.signature = e.target.checked; ed.requestRender(); });
  }

  function syncIdPanel() {
    const card = state.idCard;
    $('#idHeader').value = card.header;
    $('#idSignature').checked = card.signature;
    $$('#idRows .id-label').forEach((el) => { el.value = card.fields[+el.dataset.i].label; });
    $$('#idRows .id-value').forEach((el) => {
      const f = card.fields[+el.dataset.i];
      el.value = f.value;
      el.setAttribute('aria-label', `${f.label || 'Line ' + (+el.dataset.i + 1)} value`);
    });
  }

  /** The Text tab shows ID fields for the ID card, caption + date for everything else. */
  function updateTextPanelMode() {
    const isId = PB.currentLayout().theme === 'idcard';
    $('#idPanel').hidden = !isId;
    $('#stripTextPanel').hidden = isId;
  }

  /* ================= Layout + photo order ================= */
  function buildPhotos() {
    const picker = $('#layoutPicker');
    PB.LAYOUTS.forEach((L) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt opt-tile';
      b.dataset.layout = L.id;
      b.innerHTML = `<span>${L.name}</span><small>${L.shots} photo${L.shots > 1 ? 's' : ''}</small>`;
      picker.appendChild(b);
    });
    picker.addEventListener('click', (e) => {
      const b = e.target.closest('[data-layout]');
      if (b) ed.setLayout(b.dataset.layout);
    });

    let replaceTarget = null; // slot index for "Replace", or null for a bulk upload
    $('#btnAddPhotos').addEventListener('click', () => { replaceTarget = null; $('#replaceInput').multiple = true; $('#replaceInput').click(); });
    $('#photoList').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const i = +b.dataset.i;
      const p = state.photos;
      if (b.dataset.act === 'up' && i > 0) [p[i - 1], p[i]] = [p[i], p[i - 1]];
      else if (b.dataset.act === 'down' && i < p.length - 1) [p[i + 1], p[i]] = [p[i], p[i + 1]];
      else if (b.dataset.act === 'replace') {
        replaceTarget = i;
        $('#replaceInput').multiple = false;
        $('#replaceInput').click();
        return;
      } else if (b.dataset.act === 'remove') p[i] = null;
      else return;
      normalizePhotos();
      renderPhotoList();
      ed.requestRender();
      const again = $(`#photoList button[data-act="${b.dataset.act}"][data-i="${b.dataset.act === 'up' ? i - 1 : b.dataset.act === 'down' ? i + 1 : i}"]`);
      if (again && !again.disabled) again.focus();
    });
    $('#replaceInput').addEventListener('change', async (e) => {
      await PB.addFiles(e.target.files, replaceTarget);
      e.target.value = '';
      replaceTarget = null;
      renderPhotoList();
      renderFilterThumbs();
      syncIdPanel(); // a new photo may have a new ID number
      ed.requestRender();
    });
    $('#missingNote').addEventListener('click', (e) => {
      if (e.target.closest('[data-act="camera"]')) PB.go('camera');
      if (e.target.closest('[data-act="upload"]')) $('#btnAddPhotos').click();
    });
  }

  /** Trim trailing empty entries so the list stays tidy. */
  function normalizePhotos() {
    const p = state.photos;
    while (p.length && !p[p.length - 1]) p.pop();
  }

  ed.setLayout = function (id) {
    state.layoutId = id;
    state.stickers.forEach(clampSticker);
    markPressed($('#layoutPicker'), '[data-layout]', (x) => x.dataset.layout === id);
    updateTextPanelMode();
    syncIdPanel();
    ed.fit();
    renderStickers();
    renderPhotoList();
    ed.requestRender();
    if (PB.currentLayout().theme === 'idcard') PB.toast('Edit the name, number and more in the Text tab ✏️');
  };

  function renderPhotoList() {
    const L = PB.currentLayout();
    const n = L.shots;
    const p = state.photos;
    const count = Math.max(n, p.length);
    const list = $('#photoList');
    list.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const li = document.createElement('li');
      li.className = 'photo-item' + (i >= n ? ' extra' : '');
      const thumb = document.createElement('canvas');
      thumb.width = 96; thumb.height = 72;
      thumb.className = 'photo-thumb';
      const tctx = thumb.getContext('2d');
      if (p[i]) PB.drawCover(tctx, p[i], 0, 0, 96, 72);
      else { tctx.fillStyle = '#f6eef8'; tctx.fillRect(0, 0, 96, 72); tctx.fillStyle = '#b8a9c9'; tctx.font = '28px VT323, monospace'; tctx.textAlign = 'center'; tctx.textBaseline = 'middle'; tctx.fillText('empty', 48, 36); }
      thumb.setAttribute('aria-hidden', 'true');
      const label = i < n ? `Photo ${i + 1}` : 'Extra (not shown)';
      li.innerHTML = `<span class="photo-label">${label}</span>`;
      li.prepend(thumb);
      const actions = document.createElement('div');
      actions.className = 'photo-actions';
      actions.innerHTML =
        `<button class="btn btn-icon" data-act="up" data-i="${i}" aria-label="Move ${label} earlier" ${i === 0 ? 'disabled' : ''}>▲</button>` +
        `<button class="btn btn-icon" data-act="down" data-i="${i}" aria-label="Move ${label} later" ${i >= count - 1 ? 'disabled' : ''}>▼</button>` +
        `<button class="btn btn-icon" data-act="replace" data-i="${i}" aria-label="${p[i] ? 'Replace' : 'Add'} ${label}">${p[i] ? '↺' : '+'}</button>` +
        (p[i] ? `<button class="btn btn-icon" data-act="remove" data-i="${i}" aria-label="Remove ${label}">✕</button>` : '');
      li.appendChild(actions);
      list.appendChild(li);
    }
    const missing = n - PB.filledCount();
    const note = $('#missingNote');
    note.hidden = missing <= 0;
    if (missing > 0) {
      note.innerHTML = `This layout needs ${missing} more photo${missing > 1 ? 's' : ''}. ` +
        '<button class="btn btn-sm" data-act="camera">📸 Take more</button> <button class="btn btn-sm" data-act="upload">🖼️ Upload</button>';
    }
  }

  /* ================= Sync all controls with state ================= */
  function syncControls() {
    markPressed($('#swatches'), '.swatch', (s) => s.dataset.color === state.frameColor);
    $('#customColor').value = state.frameColor;
    markPressed($('#shapeOptions'), '[data-shape]', (x) => x.dataset.shape === state.shape);
    markPressed($('#filterOptions'), '[data-filter]', (x) => x.dataset.filter === state.filter);
    markPressed($('#layoutPicker'), '[data-layout]', (x) => x.dataset.layout === state.layoutId);
    $('#captionInput').value = state.caption;
    $('#dateToggle').checked = state.showDate;
    $('#dateFormat').value = state.dateFormat;
    $('#taglineToggle').checked = state.showTagline;
    $('#taglineInput').value = state.taglineText;
    $('#taglineInput').disabled = !state.showTagline;
    updateTextPanelMode();
    syncIdPanel();
    selectTab(currentTab);
  }

  ed.reset = function () {
    selectedId = null;
    currentTab = 'frame';
    if (stickerLayer) stickerLayer.innerHTML = '';
  };
})();
