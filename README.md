# Photobooth – Every Click Tells a Story

A free, single-page online photobooth. Plain HTML, CSS and JavaScript with no backend and no build step. Everything runs in the browser, and photos are never uploaded anywhere.

## File structure

```
index.html              All pages (Home, Layout, Camera, Decorate, Download, About, Privacy, Contact) + modals
css/styles.css          Y2K/scrapbook theme, mobile-first, breakpoints at 600px / 900px / 1025px
js/utils.js             App state, color + date helpers, toast, accessible modals, image loading, beeps
js/layouts.js           Layout definitions (2/3/4-cut strips, 2×2 grid, polaroid, student ID) + upload logic
js/render.js            Canvas renderer: frames, shapes, filters, captions, doodles, stickers, export sizes
js/camera.js            getUserMedia, mirrored preview, flip camera, countdown (10 s default), flash, retake, upload
js/editor.js            Decorate page: colors, shapes, filters, stickers (Pointer Events + pinch), doodles, text, reorder
js/export.js            PNG/JPG export, social sizes, Download, Web Share, iOS fallback, slideshow video
js/app.js               Hash router, layout picker, What's New + 5-step guide, contact form, PWA install
sw.js                   Service worker (offline app shell)
manifest.webmanifest    PWA manifest
icons/                  SVG + PNG app icons (192, 512, maskable 512, apple-touch 180)
netlify.toml, .nojekyll Hosting helpers
```

## Run locally

The camera only works on `https://` or `http://localhost`, so use a local server instead of opening the file directly:

```bash
# Python 3
python -m http.server 8080
# or Node
npx serve .
```

Then open http://localhost:8080.

To test on your phone over Wi-Fi you need HTTPS. The quickest way is to deploy (below), or use a tunnel such as `npx localtunnel --port 8080`.

## Deploy for free

GitHub Pages:
1. Create a repository and push these files to the `main` branch (keep `index.html` at the root).
2. Go to Settings → Pages → Build and deployment → Source: "Deploy from a branch", Branch: `main` / `(root)`.
3. Your site will be at `https://<user>.github.io/<repo>/` with HTTPS. All paths are relative, so a sub-folder URL works.

Netlify:
1. Drag the project folder onto https://app.netlify.com/drop, or connect the Git repo.
2. No build command is needed; the publish directory is the root (already set in `netlify.toml`).
3. Netlify serves it over HTTPS automatically.

The service worker loads fresh files from the network first, so updates show up on the next visit. After changing files, also bump `CACHE` in `sw.js` (for example `photobooth-v3`) so the offline copy is refreshed too.

## Build milestones

The code is organized so each step is self-contained:

1. MVP: `layouts.js` + `camera.js` + frame color in `editor.js` + `render.js` + Download in `export.js`.
2. Stickers and doodles: sticker/doodle sections of `editor.js`, drawn by `render.js`.
3. Filters and shapes: `PB.applyFilter` and `shapePath` in `render.js`.
4. Social export sizes, Share, iOS fallback, video: `PB.renderExport` + `export.js`.
5. PWA: `manifest.webmanifest`, `sw.js`, `initPWA()` in `app.js`.

## Browser notes

- Chrome, Edge, Firefox, Safari (macOS, iPhone, iPad). Filters use pixel math, not `ctx.filter`, so they also work in Safari.
- Camera errors (blocked permission, no camera, camera busy, not HTTPS) show a friendly message with an Upload option.
- Share uses `navigator.share({ files })` where supported (most phones, Safari, Edge); other browsers fall back to Download.
- Download is one click: it saves the file straight away. If the image is still being prepared, the button shows "Preparing…" and the download starts by itself.
- iPhone/iPad Safari: downloads need a confirm tap and go to the Files app (a browser rule). The download page shows "To save to Photos, tap Share, then Save Image."
- Instagram / Facebook in-app browsers (user agent contains `Instagram`, `FBAN` or `FBAV`) block downloads. The Download button is hidden, the finished photo opens full screen with "Press and hold the photo, then tap Save to Photos.", and a top banner suggests opening the page in a real browser.
- The slideshow video uses `MediaRecorder` (MP4 on Safari, WebM on Chrome/Firefox).

## Customizing

- Contact email: change `hello@example.com` in `index.html`.
- Default countdown and bottom caption: `timer` and `taglineText` in `PB.state` (`js/utils.js`). Users can also change both in the app.
- Student ID card defaults (header, labels, values): `PB.state.idCard` in `js/utils.js`. Users edit them in Decorate → Text; each new photo gets a new random 5–10 digit ID number unless they typed their own.
- Colors and fonts: CSS variables at the top of `css/styles.css`.
- Stickers: the `STICKERS` array in `js/editor.js`.
- Frame colors: `PB.FRAME_COLORS` in `js/utils.js`.
