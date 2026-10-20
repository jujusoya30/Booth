/* Photobooth – download page: export sizes, PNG/JPG, download, Web Share,
   iPhone tip, Instagram/Facebook full-screen "press and hold" view,
   and an optional slideshow video. */
(function () {
  'use strict';
  const PB = window.PB;
  const { $, $$, state } = PB;
  const ex = (PB.exporter = {});

  const BG_COLORS = ['#fff0f6', '#ffd6e8', '#f3edff', '#e4d9ff', '#eafaf3', '#d4f5e9', '#fffbe6', '#eaf4ff', '#ffffff', '#4a3b5c', '#1f1b24'];

  let cache = { key: null, blob: null, url: null };
  let building = null;
  let video = { blob: null, url: null, name: null };
  const inApp = PB.isInAppBrowser(); // Instagram / Facebook: downloads are blocked

  const cacheKey = () => [state.version, state.exportSize, state.exportFormat, state.exportBg].join('|');
  const sizeInfo = () => PB.EXPORT_SIZES.find((s) => s.id === state.exportSize) || PB.EXPORT_SIZES[0];
  const ext = () => (state.exportFormat === 'jpg' ? 'jpg' : 'png');
  const fileName = () => {
    const s = sizeInfo();
    return `photobooth-${PB.isoDate()}${s.id === 'original' ? '' : '-' + s.id}.${ext()}`;
  };

  ex.init = function () {
    const sizeBox = $('#sizeOptions');
    PB.EXPORT_SIZES.forEach((s, i) => {
      const label = document.createElement('label');
      label.className = 'size-opt';
      label.innerHTML = `<input type="radio" name="exportSize" value="${s.id}" ${i === 0 ? 'checked' : ''}>` +
        `<span class="size-shape size-${s.id}" aria-hidden="true"></span>` +
        `<span class="size-text"><span>${s.name}</span><small>${s.note}</small></span>`;
      sizeBox.appendChild(label);
    });
    sizeBox.addEventListener('change', (e) => {
      state.exportSize = e.target.value;
      $('#bgFieldset').hidden = state.exportSize === 'original';
      ex.update();
    });

    const bgBox = $('#bgSwatches');
    BG_COLORS.forEach((hex) => bgBox.appendChild(PB.makeSwatch(hex, `Background ${hex}`)));
    bgBox.addEventListener('click', (e) => {
      const b = e.target.closest('.swatch');
      if (b) setBg(b.dataset.color);
    });
    $('#bgCustom').addEventListener('input', (e) => setBg(e.target.value));
    setBg(state.exportBg, true);

    $$('input[name="fmt"]').forEach((r) => r.addEventListener('change', (e) => { state.exportFormat = e.target.value; ex.update(); }));
    $('#dlTaglineToggle').addEventListener('change', (e) => {
      state.showTagline = e.target.checked;
      $('#dlTaglineInput').disabled = !state.showTagline;
      PB.markDirty();
      ex.update();
    });
    let captionTimer;
    $('#dlTaglineInput').addEventListener('input', (e) => {
      state.taglineText = e.target.value;
      PB.markDirty();
      clearTimeout(captionTimer); // wait until typing pauses before re-rendering
      captionTimer = setTimeout(ex.update, 400);
    });

    // Per-device buttons and tips (the browser never changes during a visit).
    $('#btnDownload').hidden = inApp;              // in-app browsers can't download
    $('#btnViewPhoto').hidden = !inApp;            // ...so they get the full-screen view
    $('#btnOpenImage').hidden = inApp;
    $('#btnVideoDownload').hidden = inApp;
    $('#iosHint').hidden = !(PB.isIOS() && !inApp); // Safari on iPhone/iPad
    if (!navigator.canShare && !inApp) $('#btnShare').textContent = '📤 Share (download)';

    $('#btnDownload').addEventListener('click', ex.download);
    $('#btnViewPhoto').addEventListener('click', ex.openImageView);
    $('#btnShare').addEventListener('click', ex.share);
    $('#btnOpenImage').addEventListener('click', ex.openImageView);
    $('#btnVideo').addEventListener('click', ex.makeVideo);
    $('#btnVideoDownload').addEventListener('click', () => video.url && triggerDownload(video.url, video.name));
    $('#btnVideoShare').addEventListener('click', () => video.blob && shareFile(new File([video.blob], video.name, { type: video.blob.type }), true));
    $('#btnStartOver').addEventListener('click', () => {
      if (window.confirm('Start over? Your current photos and decorations will be cleared.')) PB.resetSession();
    });
  };

  function setBg(hex, silent) {
    state.exportBg = hex.toLowerCase();
    $$('#bgSwatches .swatch').forEach((s) => s.setAttribute('aria-pressed', s.dataset.color === state.exportBg ? 'true' : 'false'));
    $('#bgCustom').value = state.exportBg;
    if (!silent) ex.update();
  }

  ex.enter = function () {
    $('#dlTaglineToggle').checked = state.showTagline;
    $('#dlTaglineInput').value = state.taglineText;
    $('#dlTaglineInput').disabled = !state.showTagline;
    $('#bgFieldset').hidden = state.exportSize === 'original';
    const ready = ex.update();
    // In Instagram/Facebook, show the finished photo full screen right away.
    if (inApp) ready.then(() => { if (state.page === 'download') ex.openImageView(); }).catch(() => {});
  };

  /** Renders (or reuses) the export blob. Pre-rendering keeps the Share button
      inside the browser's "user gesture" window, which Safari requires. */
  ex.update = function () {
    const k = cacheKey();
    if (cache.key === k && cache.blob) return Promise.resolve(cache.blob);
    if (building && building.key === k) return building.promise;
    $('#exportInfo').textContent = 'Preparing your image…';
    const promise = (async () => {
      await PB.fontsReady;
      await new Promise((r) => requestAnimationFrame(r));
      const c = PB.renderExport(PB.renderOptions(), state.exportSize, state.exportBg);
      const type = state.exportFormat === 'jpg' ? 'image/jpeg' : 'image/png';
      const blob = await PB.canvasToBlob(c, type, 0.92);
      if (cacheKey() !== k) return ex.update(); // options changed while rendering
      if (cache.url) URL.revokeObjectURL(cache.url);
      cache = { key: k, blob, url: URL.createObjectURL(blob) };
      $('#exportPreview').src = cache.url;
      $('#exportInfo').textContent = `${c.width} × ${c.height}px · ${ext().toUpperCase()} · ${PB.formatBytes(blob.size)}`;
      return blob;
    })();
    building = { key: k, promise };
    promise.finally(() => { if (building && building.key === k) building = null; });
    return promise;
  };

  async function ensureBlob() {
    if (cache.key === cacheKey() && cache.blob) return cache.blob;
    return ex.update();
  }

  function triggerDownload(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /** One click = one file. If the image is still being prepared, the button
      shows "Preparing…" and the download starts by itself when it's ready. */
  let downloading = false;
  ex.download = async function () {
    if (downloading) return; // ignore extra clicks so it never saves twice
    downloading = true;
    const btn = $('#btnDownload');
    const resetButton = () => { btn.disabled = false; btn.textContent = '⬇ Download'; };
    if (!(cache.key === cacheKey() && cache.blob)) { btn.disabled = true; btn.textContent = '⏳ Preparing…'; }
    try {
      await ensureBlob();
    } catch (e) {
      console.error(e);
      PB.toast('Sorry, the image could not be created. Try a smaller size or JPG.');
      resetButton();
      downloading = false;
      return;
    }
    resetButton();
    // In-app browsers (Instagram, Facebook…) and very old iOS block downloads,
    // so show the image with the "press and hold" tip instead.
    if (PB.isInAppBrowser() || !('download' in HTMLAnchorElement.prototype)) {
      downloading = false;
      ex.openImageView();
      return;
    }
    const name = fileName();
    triggerDownload(cache.url, name);
    PB.toast(`Saved ${name} ✨`);
    setTimeout(() => { downloading = false; }, 1200); // a quick double-click won't save twice
  };

  /** Full-screen view of the finished image, saved with a long-press. */
  ex.openImageView = async function () {
    let blob;
    try { blob = await ensureBlob(); } catch (e) { PB.toast('Sorry, the image could not be created.'); return; }
    // A data: URL is the most reliable for long-press saving in phone browsers.
    $('#imageModalImg').src = await PB.blobToDataURL(blob);
    const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    $('#imgModalTitle').textContent = touch
      ? 'Press and hold the photo, then tap Save to Photos.'
      : 'Right-click the photo, then choose “Save image as”.';
    PB.openModal('imageModal');
  };

  /** Saves without the share sheet: long-press view in-app, normal download elsewhere. */
  function saveFallback(isVideo) {
    if (isVideo) {
      if (inApp) PB.toast('Open this page in your browser to save the video.');
      else triggerDownload(video.url, video.name);
    } else if (inApp) ex.openImageView();
    else ex.download();
  }

  /** Opens the system share sheet (Save Image, Instagram, Messenger, …).
      navigator.share() is called right away, inside the tap, because Safari
      rejects it if the page waits first. */
  let shareDenied = 0;
  function shareFile(file, isVideo) {
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) {
      if (!inApp) PB.toast("Sharing isn't available in this browser, so we saved it instead.");
      saveFallback(isVideo);
      return;
    }
    navigator.share({ files: [file], title: 'My photobooth ' + (isVideo ? 'video' : 'strip') })
      .then(() => { shareDenied = 0; })
      .catch((e) => {
        if (e.name === 'AbortError') return; // user closed the share sheet
        if (e.name === 'NotAllowedError' && ++shareDenied < 2) {
          PB.toast('Your photo is ready. Tap Share again.'); // the tap "expired" while preparing
          return;
        }
        console.warn('Share failed:', e);
        shareDenied = 0;
        saveFallback(isVideo);
      });
  }

  const imageFile = (blob) => new File([blob], fileName(), { type: blob.type });

  ex.share = function () {
    // Usual case: the image was pre-rendered when the page opened, so share instantly.
    if (cache.key === cacheKey() && cache.blob) {
      shareFile(imageFile(cache.blob), false);
      return;
    }
    // Still preparing: wait, then try (Chrome allows it; Safari may ask for one more tap).
    const btn = $('#btnShare');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Preparing…';
    ensureBlob()
      .then((blob) => shareFile(imageFile(blob), false))
      .catch(() => PB.toast('Sorry, the image could not be created.'))
      .finally(() => { btn.disabled = false; btn.textContent = label; });
  };

  /* ================= Slideshow video (optional) ================= */
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return null;
    return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find((t) => MediaRecorder.isTypeSupported(t)) || null;
  }

  ex.makeVideo = async function () {
    const mime = pickMime();
    if (!mime || !HTMLCanvasElement.prototype.captureStream) {
      PB.toast("Video export isn't supported in this browser. Try Chrome, Edge, Firefox or a recent Safari.");
      return;
    }
    const btn = $('#btnVideo');
    btn.disabled = true;
    const opts = PB.renderOptions();
    const frames = opts.layout.slots.map((_, i) => opts.photos[i]).filter(Boolean).map((p) => PB.getFiltered(p, opts.filter));
    const finalCard = PB.renderExport(opts, 'post', state.exportBg);
    const W = 1080, H = 1350, PER = 1100, HOLD = 2400;
    const total = frames.length * PER + HOLD;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const ink = PB.inkFor(opts.frameColor);
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    function draw(t) {
      const i = Math.floor(t / PER);
      if (i < frames.length) {
        const local = (t % PER) / PER;
        ctx.globalAlpha = 1;
        ctx.fillStyle = opts.frameColor;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = Math.min(1, local / 0.15);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); PB.roundRectPath(ctx, 74, 104, 932, 1032, 36); ctx.fill();
        ctx.save();
        ctx.beginPath(); PB.roundRectPath(ctx, 90, 120, 900, 1000, 26); ctx.clip();
        PB.drawCover(ctx, frames[i], 90, 120, 900, 1000, 1.1 - 0.1 * ease(local));
        ctx.restore();
        ctx.fillStyle = ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `64px ${PB.FONTS.FONT_PIXEL}`;
        ctx.fillText(`${i + 1} / ${frames.length}`, W / 2, 1230);
      } else {
        const local = Math.min(1, (t - frames.length * PER) / 500);
        ctx.globalAlpha = 1;
        ctx.fillStyle = state.exportBg;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = ease(local);
        ctx.drawImage(finalCard, 0, 0);
      }
      ctx.globalAlpha = 1;
    }

    try {
      draw(0);
      const stream = c.captureStream(30);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(250);
      const t0 = performance.now();
      await new Promise((resolve) => {
        function tick(now) {
          const t = now - t0;
          draw(Math.min(t, total));
          btn.textContent = `Recording… ${Math.min(100, Math.round((t / total) * 100))}%`;
          if (t < total) requestAnimationFrame(tick); else resolve();
        }
        requestAnimationFrame(tick);
      });
      rec.stop();
      await stopped;
      stream.getTracks().forEach((tr) => tr.stop());
      const type = mime.split(';')[0];
      if (video.url) URL.revokeObjectURL(video.url);
      video.blob = new Blob(chunks, { type });
      video.url = URL.createObjectURL(video.blob);
      video.name = `photobooth-${PB.isoDate()}.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
      const v = $('#videoOut');
      v.src = video.url;
      v.hidden = false;
      $('#videoActions').hidden = false;
      PB.toast('Your video is ready 🎬');
    } catch (e) {
      console.error(e);
      PB.toast('Video recording failed in this browser.');
    } finally {
      btn.disabled = false;
      btn.textContent = '🎬 Create video again';
    }
  };

  ex.reset = function () {
    cache = { key: null, blob: null, url: null };
    $('#exportPreview').removeAttribute('src');
    $('#videoOut').hidden = true;
    $('#videoActions').hidden = true;
  };
})();
