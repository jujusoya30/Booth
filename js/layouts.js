/* Photobooth – layout definitions.
   All sizes are in "layout units" (1 unit = 1px at 1x). Exports render at 2x. */
(function () {
  'use strict';
  const PB = window.PB;
  const FOOTER = 170;

  function strip(id, name, n) {
    const W = 600, P = 40, G = 20, SW = 520, SH = 390;
    const slots = [];
    for (let i = 0; i < n; i++) slots.push({ x: P, y: P + i * (SH + G), w: SW, h: SH });
    const H = P + n * SH + (n - 1) * G + FOOTER;
    return { id, name, shots: n, W, H, slots, footer: { x: 0, y: H - FOOTER, w: W, h: FOOTER }, theme: 'strip', desc: `${n} photos · vertical strip` };
  }

  function grid2x2() {
    const W = 1000, P = 40, G = 20, SW = 450, SH = 338;
    const slots = [
      { x: P, y: P, w: SW, h: SH }, { x: P + SW + G, y: P, w: SW, h: SH },
      { x: P, y: P + SH + G, w: SW, h: SH }, { x: P + SW + G, y: P + SH + G, w: SW, h: SH },
    ];
    const H = P + 2 * SH + G + FOOTER;
    return { id: 'grid4', name: '2×2 Grid', shots: 4, W, H, slots, footer: { x: 0, y: H - FOOTER, w: W, h: FOOTER }, theme: 'strip', desc: '4 photos · square-ish grid' };
  }

  function polaroid() {
    const W = 640, H = 800;
    return { id: 'polaroid', name: 'Polaroid', shots: 1, W, H, slots: [{ x: 40, y: 40, w: 560, h: 560 }], footer: { x: 0, y: 600, w: W, h: 200 }, theme: 'polaroid', desc: '1 photo · instant-film look' };
  }

  function idCard() {
    return { id: 'idcard', name: 'Student ID', shots: 1, W: 1000, H: 630, slots: [{ x: 56, y: 140, w: 312, h: 416 }], footer: null, theme: 'idcard', desc: '1 photo · photocard ID you can edit' };
  }

  PB.LAYOUTS = [strip('strip2', '2-Cut Strip', 2), strip('strip3', '3-Cut Strip', 3), strip('strip4', '4-Cut Strip', 4), grid2x2(), polaroid(), idCard()];
  PB.getLayout = (id) => PB.LAYOUTS.find((l) => l.id === id) || PB.LAYOUTS[2];
  PB.currentLayout = () => PB.getLayout(PB.state.layoutId);

  /** Every new photo in the first slot gets a fresh ID number,
      unless the user typed their own number. */
  PB.onNewPhoto = function (i) {
    const card = PB.state.idCard;
    if (i === 0 && card.codeAuto) card.fields[2].value = PB.newIdCode(card.fields[2].value);
  };

  /** Number of filled slots for the current layout. */
  PB.filledCount = () => {
    const n = PB.currentLayout().shots;
    let c = 0;
    for (let i = 0; i < n; i++) if (PB.state.photos[i]) c++;
    return c;
  };

  /** Adds uploaded files: fills empty slots first, then replaces from slot 1.
      If `targetIndex` is given, the first file goes there. */
  PB.addFiles = async function (fileList, targetIndex) {
    const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name));
    if (!files.length) return 0;
    const st = PB.state;
    const n = PB.currentLayout().shots;
    let replaceCursor = 0, added = 0;
    for (const f of files) {
      let c;
      try { c = await PB.fileToCanvas(f); } catch (e) { PB.toast(`Couldn't open ${f.name}`); continue; }
      let idx;
      if (targetIndex != null && added === 0) idx = targetIndex;
      else {
        idx = -1;
        for (let i = 0; i < n; i++) if (!st.photos[i]) { idx = i; break; }
        if (idx === -1) idx = replaceCursor++ % n;
      }
      st.photos[idx] = c;
      PB.onNewPhoto(idx);
      added++;
    }
    PB.markDirty();
    if (added) PB.toast(`Added ${added} photo${added > 1 ? 's' : ''} ✨`);
    return added;
  };
})();
