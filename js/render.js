/* Photobooth – canvas rendering engine.
   One function (PB.renderStrip) draws the whole strip so the on-screen preview
   and the downloaded file always match. Filters are done with pixel math
   (ctx.filter is not supported in every Safari version). */
(function () {
  'use strict';
  const PB = window.PB;

  const FONT_HAND = '"Patrick Hand", "Comic Sans MS", "Chalkboard SE", cursive';
  const FONT_PIXEL = 'VT323, "Courier New", monospace';
  const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';
  PB.FONTS = { FONT_HAND, FONT_PIXEL, EMOJI_FONT };

  /* =================== Filters =================== */
  PB.FILTERS = [
    { id: 'none', name: 'Original' },
    { id: 'bw', name: 'B&W' },
    { id: 'warm', name: 'Warm' },
    { id: 'vintage', name: 'Vintage' },
    { id: 'glow', name: 'Soft Glow' },
  ];

  const filterCache = new WeakMap();
  /** Returns a filtered copy of `src`, cached per photo + filter. */
  PB.getFiltered = function (src, filter) {
    if (!src || filter === 'none') return src;
    let entry = filterCache.get(src);
    if (!entry) { entry = {}; filterCache.set(src, entry); }
    if (!entry[filter]) entry[filter] = PB.applyFilter(src, filter);
    return entry[filter];
  };

  PB.applyFilter = function (src, filter) {
    const w = src.width, h = src.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0);
    if (filter === 'none') return c;

    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data; // Uint8ClampedArray clamps for us
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (filter === 'bw') {
        let y = 0.299 * r + 0.587 * g + 0.114 * b;
        y = (y - 128) * 1.12 + 128;
        r = g = b = y;
      } else if (filter === 'warm') {
        r = r * 1.08 + 12; g = g * 1.02 + 5; b = b * 0.86;
      } else if (filter === 'vintage') {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        r = (r * 0.35 + sr * 0.65) * 0.86 + 28;
        g = (g * 0.35 + sg * 0.65) * 0.86 + 22;
        b = (b * 0.35 + sb * 0.65) * 0.86 + 18;
      } else if (filter === 'glow') {
        r = r * 1.04 + 14; g = g * 1.03 + 10; b = b * 1.03 + 14;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);

    if (filter === 'vintage') {
      const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) / 2);
      grd.addColorStop(0, 'rgba(60,30,10,0)');
      grd.addColorStop(1, 'rgba(60,30,10,0.45)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
    }
    if (filter === 'glow') {
      // Cheap blur: downscale twice, then upscale with smoothing, blend with "screen".
      const mid = document.createElement('canvas');
      mid.width = Math.max(1, Math.round(w / 4)); mid.height = Math.max(1, Math.round(h / 4));
      const mctx = mid.getContext('2d');
      mctx.imageSmoothingQuality = 'high';
      mctx.drawImage(c, 0, 0, mid.width, mid.height);
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(w / 14)); small.height = Math.max(1, Math.round(h / 14));
      const sctx = small.getContext('2d');
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(mid, 0, 0, small.width, small.height);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(small, 0, 0, w, h);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,200,230,0.08)';
      ctx.fillRect(0, 0, w, h);
    }
    return c;
  };

  /* =================== Shapes =================== */
  PB.SHAPES = [
    { id: 'square', name: 'Square', icon: '⬜' },
    { id: 'rounded', name: 'Rounded', icon: '▢' },
    { id: 'heart', name: 'Heart', icon: '♡' },
    { id: 'circle', name: 'Circle', icon: '◯' },
  ];

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  PB.roundRectPath = roundRectPath;

  /** Heart centered at (cx, cy). Its bounds are about 1.66s wide and 1.5s tall. */
  function heartPath(ctx, cx, cy, s) {
    ctx.moveTo(cx, cy + s * 0.9);
    ctx.bezierCurveTo(cx - s * 1.3, cy + s * 0.1, cx - s * 0.9, cy - s * 1.0, cx, cy - s * 0.45);
    ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.0, cx + s * 1.3, cy + s * 0.1, cx, cy + s * 0.9);
    ctx.closePath();
  }

  function shapePath(ctx, shape, r) {
    ctx.beginPath();
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (shape === 'rounded') roundRectPath(ctx, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.12);
    else if (shape === 'circle') ctx.arc(cx, cy, Math.min(r.w, r.h) / 2, 0, Math.PI * 2);
    else if (shape === 'heart') {
      const s = Math.min(r.w / 1.66, r.h / 1.5) * 0.98;
      heartPath(ctx, cx, cy - s * 0.15, s);
    } else ctx.rect(r.x, r.y, r.w, r.h);
  }

  /* =================== Decorations =================== */
  function sparkle(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
  }
  function heart(ctx, x, y, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    heartPath(ctx, x, y, r);
    ctx.fill();
    ctx.restore();
  }
  PB.drawSparkle = sparkle;
  PB.drawHeart = heart;

  /* =================== Main renderer =================== */
  /**
   * Draws a strip into `canvas`.
   * o: { layout, photos, frameColor, shape, filter, caption, showDate, dateFormat,
   *      showTagline, taglineText, strokes, stickers, includeStickers, scale, idCard }
   */
  PB.renderStrip = function (canvas, o) {
    const L = o.layout, s = o.scale || 1;
    const cw = Math.round(L.W * s), ch = Math.round(L.H * s);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const ink = PB.inkFor(o.frameColor);

    ctx.fillStyle = o.frameColor;
    ctx.fillRect(0, 0, L.W, L.H);

    if (L.theme === 'idcard') drawIdBase(ctx, L, o);
    L.slots.forEach((slot, i) => drawSlot(ctx, slot, o.photos[i], o, i, ink));
    if (L.theme === 'idcard') drawIdDetails(ctx, L, o);
    else drawFooter(ctx, L, o, ink);

    drawDoodles(ctx, L, o.strokes, s);
    if (o.includeStickers) drawStickers(ctx, o.stickers);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvas;
  };

  function drawSlot(ctx, slot, photo, o, i, ink) {
    ctx.save();
    shapePath(ctx, o.shape, slot);
    if (photo) {
      ctx.clip();
      PB.drawCover(ctx, PB.getFiltered(photo, o.filter), slot.x, slot.y, slot.w, slot.h);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.setLineDash([12, 10]);
      ctx.lineWidth = 4;
      ctx.strokeStyle = PB.rgba(ink, 0.35);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = PB.rgba(ink, 0.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(Math.min(slot.w, slot.h) * 0.28)}px ${FONT_PIXEL}`;
      ctx.fillText(String(i + 1), slot.x + slot.w / 2, slot.y + slot.h / 2);
    }
    ctx.restore();
  }

  function drawFooter(ctx, L, o, ink) {
    const f = L.footer;
    const big = L.theme === 'polaroid';
    const lines = [];
    if (o.caption) lines.push({ t: o.caption, font: `${big ? 54 : 46}px ${FONT_HAND}`, h: big ? 60 : 52 });
    if (o.showDate) lines.push({ t: PB.formatDate(new Date(), o.dateFormat), font: `${big ? 38 : 34}px ${FONT_PIXEL}`, h: 36 });
    if (o.showTagline && o.taglineText) lines.push({ t: o.taglineText, font: `24px ${FONT_HAND}`, h: 28, a: 0.75 });

    // little scrapbook decorations
    const deco = PB.rgba(ink, 0.4);
    sparkle(ctx, 44, f.y + 46, 14, deco);
    sparkle(ctx, 72, f.y + 74, 7, deco);
    heart(ctx, L.W - 46, f.y + 44, 11, deco);
    sparkle(ctx, L.W - 46, f.y + f.h - 42, 10, deco);
    heart(ctx, 46, f.y + f.h - 40, 8, deco);

    const gap = 8;
    const total = lines.reduce((a, l) => a + l.h, 0) + gap * Math.max(0, lines.length - 1);
    let y = f.y + (f.h - total) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of lines) {
      ctx.font = l.font;
      ctx.fillStyle = PB.rgba(ink, l.a || 1);
      ctx.fillText(l.t, L.W / 2, y + l.h / 2, L.W - 140);
      y += l.h + gap;
    }
  }

  /* ---- Student ID card theme (photocard style: color band, framed photo,
          label/value list, barcode, big faint initial and a signature) ---- */
  const FONT_SIGN = '"Caveat", "Segoe Script", "Bradley Hand", cursive';
  const ID_BAND = 96;

  /** One-hue palette from the frame color: stronger band, deep text color. */
  function idPalette(base) {
    const { h, s } = PB.hexToHsl(base);
    const dark = PB.luminance(base) <= 0.28;
    const sat = PB.clamp(s * 0.6, 0, 62); // greys stay grey
    const band = dark ? PB.mix(base, '#ffffff', 0.28) : PB.hslToHex(h, sat, 58);
    const ink = dark ? '#ffffff' : PB.hslToHex(h, Math.min(sat, 55), 32);
    return { band, bandInk: PB.inkFor(band), ink };
  }

  /** Card lines in upper case. Empty values use defaults: name, today, frame color. */
  PB.idCardValues = function (o) {
    const card = o.idCard || PB.state.idCard;
    const d = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const fallback = ['YOUR NAME', '', '', `${d.getFullYear()} - ${p2(d.getMonth() + 1)} - ${p2(d.getDate())}`, o.frameColor];
    return card.fields.map((f, i) => ({
      label: (f.label || '').trim().toUpperCase(),
      value: ((f.value || '').trim() || fallback[i] || '').toUpperCase(),
    }));
  };

  function drawIdBase(ctx, L, o) {
    const card = o.idCard || PB.state.idCard;
    const p = idPalette(o.frameColor);
    const name = (card.fields[0].value || '').trim();

    // top band: header on the left, small caption in the middle, round badge on the right
    ctx.fillStyle = p.band;
    ctx.fillRect(0, 0, L.W, ID_BAND);
    ctx.fillStyle = p.bandInk;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `44px ${FONT_PIXEL}`;
    const header = (card.header || '').trim().toUpperCase();
    ctx.fillText(header, 40, ID_BAND / 2 + 2, 560);
    const headerW = Math.min(560, ctx.measureText(header).width);
    if (o.showTagline && o.taglineText) {
      const room = L.W - 110 - (40 + headerW + 40);
      if (room > 80) {
        ctx.font = `30px ${FONT_PIXEL}`;
        ctx.textAlign = 'right';
        ctx.globalAlpha = 0.9;
        ctx.fillText(o.taglineText.toUpperCase(), L.W - 110, ID_BAND / 2 + 2, room);
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(L.W - 56, ID_BAND / 2, 30, 0, Math.PI * 2);
    ctx.fill();
    heart(ctx, L.W - 56, ID_BAND / 2 - 2, 14, p.band);

    // big faint initial (or heart) behind the details
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.translate(700, 380);
    ctx.rotate(-0.1);
    if (name) {
      ctx.fillStyle = p.band;
      ctx.font = `bold 420px ${FONT_HAND}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Array.from(name.toUpperCase())[0], 0, 0);
    } else {
      heart(ctx, 0, 0, 150, p.band);
    }
    ctx.restore();

    // vertical barcode on the right edge; its pattern follows the ID number + name
    const code = (card.fields[2] && card.fields[2].value) || '';
    const seed = Array.from(code + '|' + name).reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
    const rand = PB.rng(seed);
    ctx.fillStyle = p.ink;
    ctx.globalAlpha = 0.85;
    for (let y = 124; y < 380;) {
      const bh = 2 + Math.floor(rand() * 5);
      ctx.fillRect(926, y, 44, bh);
      y += bh + 2 + Math.floor(rand() * 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawIdDetails(ctx, L, o) {
    const card = o.idCard || PB.state.idCard;
    const p = idPalette(o.frameColor);
    const sl = L.slots[0];

    // photo border in the band color (follows the chosen photo shape)
    ctx.save();
    shapePath(ctx, o.shape, { x: sl.x - 4, y: sl.y - 4, w: sl.w + 8, h: sl.h + 8 });
    ctx.lineWidth = 5;
    ctx.strokeStyle = p.band;
    ctx.stroke();
    ctx.restore();

    // label / value list
    const x = 420, maxW = 486;
    let y = 128;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    PB.idCardValues(o).forEach((f) => {
      ctx.fillStyle = PB.rgba(p.ink, 0.7);
      ctx.font = `24px ${FONT_PIXEL}`;
      ctx.fillText(f.label, x, y, maxW);
      ctx.fillStyle = p.ink;
      ctx.font = `bold 42px ${FONT_HAND}`;
      ctx.fillText(f.value, x, y + 22, maxW);
      if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(f.value)) { // color dot after a hex code
        const w = Math.min(maxW - 40, ctx.measureText(f.value).width);
        ctx.beginPath();
        ctx.arc(x + w + 24, y + 44, 12, 0, Math.PI * 2);
        ctx.fillStyle = f.value;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.ink;
        ctx.stroke();
      }
      y += 94;
    });

    // signature written from the name
    const name = (card.fields[0].value || '').trim();
    if (card.signature && name) {
      ctx.save();
      ctx.translate(800, 548);
      ctx.rotate(-0.16);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = p.band;
      ctx.font = `700 80px ${FONT_SIGN}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, 0, 0, 320);
      ctx.restore();
    }
  }

  /* ---- Doodles (separate layer so the eraser only erases ink) ---- */
  const doodleCanvas = document.createElement('canvas');
  function drawDoodles(ctx, L, strokes, s) {
    if (!strokes || !strokes.length) return;
    const w = Math.round(L.W * s), h = Math.round(L.H * s);
    if (doodleCanvas.width !== w) doodleCanvas.width = w;
    if (doodleCanvas.height !== h) doodleCanvas.height = h;
    const d = doodleCanvas.getContext('2d');
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.clearRect(0, 0, w, h);
    d.setTransform(s, 0, 0, s, 0, 0);
    d.lineCap = 'round';
    d.lineJoin = 'round';
    for (const st of strokes) {
      const p = st.points;
      if (!p.length) continue;
      d.globalCompositeOperation = st.mode === 'eraser' ? 'destination-out' : 'source-over';
      d.strokeStyle = d.fillStyle = st.color;
      d.lineWidth = st.size;
      d.beginPath();
      if (p.length === 1) {
        d.arc(p[0][0], p[0][1], st.size / 2, 0, Math.PI * 2);
        d.fill();
        continue;
      }
      d.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length - 1; i++) {
        const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
        d.quadraticCurveTo(p[i][0], p[i][1], mx, my);
      }
      const last = p[p.length - 1];
      d.lineTo(last[0], last[1]);
      d.stroke();
    }
    d.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(doodleCanvas, 0, 0);
    ctx.restore();
  }

  function drawStickers(ctx, stickers) {
    for (const st of stickers || []) {
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.rot);
      if (st.flip) ctx.scale(-1, 1);
      ctx.font = `${st.size}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(st.emoji, 0, 0);
      ctx.restore();
    }
  }

  /* =================== Export compositions =================== */
  PB.EXPORT_SIZES = [
    { id: 'original', name: 'Original photo strip', note: '2× resolution' },
    { id: 'post', name: 'Instagram / Facebook post', note: '4:5 · 1080×1350', w: 1080, h: 1350 },
    { id: 'square', name: 'Square post', note: '1:1 · 1080×1080', w: 1080, h: 1080 },
    { id: 'story', name: 'Story / TikTok / Reels', note: '9:16 · 1080×1920', w: 1080, h: 1920 },
  ];

  /** Builds the final image canvas for a given export size. */
  PB.renderExport = function (opts, sizeId, bg) {
    const size = PB.EXPORT_SIZES.find((x) => x.id === sizeId) || PB.EXPORT_SIZES[0];
    const L = opts.layout;
    if (!size.w) {
      return PB.renderStrip(document.createElement('canvas'), Object.assign({}, opts, { scale: 2, includeStickers: true }));
    }
    const out = document.createElement('canvas');
    out.width = size.w; out.height = size.h;
    const ctx = out.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size.w, size.h);

    // scattered sparkles + hearts on the background
    const deco = PB.rgba(PB.inkFor(bg), 0.16);
    const rand = PB.rng(7);
    for (let i = 0; i < 26; i++) {
      const x = rand() * size.w, y = rand() * size.h, r = 8 + rand() * 18;
      (i % 3 === 0 ? heart : sparkle)(ctx, x, y, r, deco);
    }

    const m = size.w * 0.08;
    const s = Math.min((size.w - 2 * m) / L.W, (size.h - 2 * m) / L.H);
    const strip = PB.renderStrip(document.createElement('canvas'), Object.assign({}, opts, { scale: s, includeStickers: true }));
    const x = Math.round((size.w - strip.width) / 2), y = Math.round((size.h - strip.height) / 2);
    ctx.save();
    ctx.shadowColor = 'rgba(74,59,92,0.22)';
    ctx.shadowBlur = 36;
    ctx.shadowOffsetY = 14;
    ctx.drawImage(strip, x, y);
    ctx.restore();
    return out;
  };
})();
