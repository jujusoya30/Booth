/* Photobooth – camera page: getUserMedia, countdown, flash, capture, flip, upload. */
(function () {
  'use strict';
  const PB = window.PB;
  const { $, state } = PB;

  const cam = (PB.camera = { stream: null, facing: 'user', mirrored: true, busy: false, active: false, abort: false });
  let video;

  const ERRORS = {
    insecure: {
      title: 'Camera needs a secure connection',
      text: 'Browsers only allow the camera on HTTPS pages or on localhost. Open this site with an https:// address (GitHub Pages and Netlify do this for you), or upload photos instead.',
    },
    unsupported: {
      title: "This browser can't use the camera",
      text: "Your browser doesn't support camera access here. Try the latest Chrome, Safari, Edge or Firefox, or upload photos instead.",
    },
    denied: {
      title: 'Camera permission was blocked',
      text: 'No worries! Allow camera access in your browser settings (tap the 🔒 or ⓘ icon next to the address), then tap “Try again”. You can also upload photos instead.',
    },
    notfound: {
      title: 'No camera found',
      text: "We couldn't find a camera on this device. Plug one in and tap “Try again”, or upload photos instead.",
    },
    busy: {
      title: 'Camera is busy',
      text: 'Another app or tab might be using the camera. Close it and tap “Try again”, or upload photos instead.',
    },
    unknown: {
      title: 'Camera could not start',
      text: 'Something went wrong while starting the camera. Tap “Try again”, or upload photos instead.',
    },
  };

  function errorKind(err) {
    switch (err && err.name) {
      case 'NotAllowedError': case 'PermissionDeniedError': case 'SecurityError': return 'denied';
      case 'NotFoundError': case 'DevicesNotFoundError': case 'OverconstrainedError': return 'notfound';
      case 'NotReadableError': case 'TrackStartError': case 'AbortError': return 'busy';
      default: return 'unknown';
    }
  }

  function showError(kind) {
    const e = ERRORS[kind] || ERRORS.unknown;
    $('#camErrorTitle').textContent = e.title;
    $('#camErrorText').textContent = e.text;
    $('#btnCamRetry').hidden = kind === 'insecure' || kind === 'unsupported';
    $('#camError').hidden = false;
    setStatus('');
    updateUI();
  }
  const hideError = () => { $('#camError').hidden = true; };
  const setStatus = (t) => { $('#camStatus').textContent = t; };

  cam.init = function () {
    video = $('#video');
    $('#btnShoot').addEventListener('click', onShoot);
    $('#btnFlip').addEventListener('click', () => cam.flip());
    $('#btnUpload').addEventListener('click', () => $('#fileUpload').click());
    $('#btnCamUpload').addEventListener('click', () => $('#fileUpload').click());
    $('#btnCamRetry').addEventListener('click', () => cam.start());
    $('#fileUpload').addEventListener('change', async (e) => {
      await PB.addFiles(e.target.files);
      e.target.value = '';
      renderThumbs();
      updateUI();
    });
    $('#btnToCustomize').addEventListener('click', () => PB.go('customize'));
    $('#timerSelect').addEventListener('change', (e) => { state.timer = +e.target.value; });
    $('#soundToggle').addEventListener('change', (e) => { state.sound = e.target.checked; });
    $('#shotThumbs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-retake]');
      if (b && !cam.busy) runSession([+b.dataset.retake]);
    });
    // Turn the camera off when the tab is hidden, back on when visible.
    document.addEventListener('visibilitychange', () => {
      if (!cam.active) return;
      if (document.hidden) { cam.abort = true; cam.stop(); }
      else if (!cam.stream) cam.start();
    });
  };

  cam.enter = function () {
    cam.active = true;
    const L = PB.currentLayout();
    const slot = L.slots[0];
    const vp = $('#camViewport');
    vp.style.aspectRatio = `${slot.w} / ${slot.h}`;
    vp.style.maxWidth = `calc(62vh * ${(slot.w / slot.h).toFixed(3)})`;
    $('#camSub').textContent = `${L.name}: we'll take ${L.shots} photo${L.shots > 1 ? 's' : ''} automatically with a countdown.`;
    renderThumbs();
    updateUI();
    cam.start();
  };

  cam.leave = function () {
    cam.active = false;
    cam.abort = true;
    cam.stop();
  };

  cam.stop = function () {
    if (cam.stream) cam.stream.getTracks().forEach((t) => t.stop());
    cam.stream = null;
    if (video) video.srcObject = null;
  };

  async function getStream(facing) {
    const constraints = { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: { ideal: facing } };
    try {
      return await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    } catch (e) {
      if (e.name === 'OverconstrainedError' || e.name === 'ConstraintNotSatisfiedError') {
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      throw e;
    }
  }

  cam.start = async function () {
    hideError();
    if (!window.isSecureContext) return showError('insecure');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return showError('unsupported');
    cam.stop();
    setStatus('Starting camera…');
    try {
      const stream = await getStream(cam.facing);
      if (!cam.active || document.hidden) { stream.getTracks().forEach((t) => t.stop()); return; }
      cam.stream = stream;
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const settings = (track && track.getSettings && track.getSettings()) || {};
      // Laptops usually report no facingMode: treat as front camera (mirrored).
      cam.mirrored = (settings.facingMode || cam.facing) !== 'environment';
      video.classList.toggle('mirrored', cam.mirrored);
      await video.play().catch(() => {});
      setStatus('');
      updateFlipButton();
    } catch (err) {
      console.warn('Camera error:', err);
      showError(errorKind(err));
    }
    updateUI();
  };

  async function updateFlipButton() {
    let count = 0;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      count = devices.filter((d) => d.kind === 'videoinput').length;
    } catch (e) { /* ignore */ }
    const touch = navigator.maxTouchPoints > 0;
    $('#btnFlip').hidden = !(count > 1 || (touch && count === 0));
  }

  cam.flip = async function () {
    if (cam.busy) return;
    cam.facing = cam.facing === 'user' ? 'environment' : 'user';
    await cam.start();
  };

  cam.capture = function () {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (vw < 16 || vh < 16) return null; // no real frame decoded yet
    const s = Math.min(1, 1600 / Math.max(vw, vh));
    const c = document.createElement('canvas');
    c.width = Math.round(vw * s);
    c.height = Math.round(vh * s);
    const ctx = c.getContext('2d');
    if (cam.mirrored) { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(video, 0, 0, c.width, c.height);
    return c;
  };

  /* ---------- Sessions ---------- */
  function onShoot() {
    if (cam.busy) { cam.abort = true; return; } // button doubles as "Stop"
    PB.unlockAudio();
    const n = PB.currentLayout().shots;
    const indices = [];
    if (PB.filledCount() >= n) {
      for (let i = 0; i < n; i++) { indices.push(i); }
    } else {
      for (let i = 0; i < n; i++) if (!state.photos[i]) indices.push(i);
    }
    runSession(indices);
  }

  async function runSession(indices) {
    if (!cam.stream || !video.videoWidth) {
      PB.toast("The camera isn't ready yet. You can upload photos instead.");
      return;
    }
    PB.unlockAudio();
    cam.busy = true;
    cam.abort = false;
    updateUI();
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      $('#shotCounter').textContent = `Shot ${k + 1} of ${indices.length}`;
      const ok = await countdown(state.timer);
      if (!ok || cam.abort || !cam.stream) break;
      flash();
      PB.beep(1200, 0.12);
      const c = cam.capture();
      if (c) { state.photos[i] = c; PB.onNewPhoto(i); PB.markDirty(); }
      renderThumbs();
      await PB.sleep(700);
    }
    cam.busy = false;
    $('#shotCounter').textContent = '';
    $('#countdown').textContent = '';
    updateUI();
    if (!cam.abort && PB.filledCount() >= PB.currentLayout().shots) PB.toast('All done! Tap “Next” to decorate ✨');
  }

  async function countdown(sec) {
    const el = $('#countdown');
    for (let t = sec; t > 0; t--) {
      if (cam.abort) { el.textContent = ''; return false; }
      el.textContent = t;
      el.classList.remove('pop');
      void el.offsetWidth; // restart CSS animation
      el.classList.add('pop');
      if (t <= 3) PB.beep(660, 0.08); // beep only on the final 3-2-1
      await PB.sleep(1000);
    }
    el.textContent = '';
    return !cam.abort;
  }

  function flash() {
    const f = $('#flash');
    f.classList.remove('go');
    void f.offsetWidth;
    f.classList.add('go');
  }

  /* ---------- UI ---------- */
  function renderThumbs() {
    const n = PB.currentLayout().shots;
    const box = $('#shotThumbs');
    box.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const p = state.photos[i];
      const item = document.createElement('div');
      item.className = 'shot-thumb' + (p ? ' filled' : '');
      if (p) {
        const c = document.createElement('canvas');
        c.width = 160; c.height = 120;
        PB.drawCover(c.getContext('2d'), p, 0, 0, 160, 120);
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', `Photo ${i + 1}`);
        item.appendChild(c);
        const b = document.createElement('button');
        b.className = 'btn btn-sm thumb-retake';
        b.dataset.retake = i;
        b.setAttribute('aria-label', `Retake photo ${i + 1}`);
        b.textContent = '↻';
        item.appendChild(b);
      } else {
        const s = document.createElement('span');
        s.className = 'thumb-empty';
        s.textContent = i + 1;
        item.appendChild(s);
      }
      box.appendChild(item);
    }
  }
  cam.renderThumbs = renderThumbs;

  function updateUI() {
    const n = PB.currentLayout().shots;
    const filled = PB.filledCount();
    const shoot = $('#btnShoot');
    if (cam.busy) shoot.textContent = '■ Stop';
    else if (filled === 0) shoot.textContent = '📸 Start';
    else if (filled < n) shoot.textContent = '📸 Take the rest';
    else shoot.textContent = '↻ Retake all';
    shoot.disabled = !cam.busy && !cam.stream;
    $('#btnFlip').disabled = cam.busy;
    $('#btnUpload').disabled = cam.busy;
    PB.$$('.thumb-retake').forEach((b) => { b.disabled = cam.busy || !cam.stream; });
    $('#btnToCustomize').disabled = cam.busy || filled === 0;
  }
  cam.updateUI = updateUI;
})();
