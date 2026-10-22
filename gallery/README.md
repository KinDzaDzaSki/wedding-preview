# Свадбена галерија — the guest gallery

A **standalone page** (the `qrgallery.inviteclick.com` shape, not a slide in the
invitation). Guests scan a QR at the table, land here, and upload and browse
everyone's photos from the day.

This folder is **self-contained** — it can be deployed on its own with its root
here, and it does not reach outside itself.

```
gallery/
├── index.html      the page
├── gallery.css     its own styling (same palette as the invitation)
├── gallery.js      resize, upload, grid, lightbox, delete
├── qr.svg          the QR, for the page and the table cards
├── qr-card.html    printable A6 table cards, 4-up on A4
├── og.png / og.svg link preview for when the QR is shared in a chat
└── worker/         the Cloudflare Worker + R2 API
```

## The one decision that makes this work

**Photos are resized in the browser before they leave the phone.** A modern
phone photo is 3–8 MB; 300 guests × 30 photos would be 20+ GB, which breaks
every free tier and makes the grid unusable over mobile data.

Every photo is decoded once and re-encoded twice:

| variant | size | bytes | where it's used |
|---|---|---|---|
| `grid` | 800px | ~86 KB | the tile grid |
| `full` | 1600px | ~271 KB | lightbox + download |

Measured on a 0.75 MB 4.3 MP test photo: **89% smaller tiles, 65% smaller
full images.** EXIF orientation is applied via
`createImageBitmap(file, { imageOrientation: 'from-image' })`, so portrait
photos don't upload sideways.

Sized for 300 guests × 30 photos ≈ **3.2 GB** — inside R2's 10 GB free tier,
and **egress is free at every tier**, which is what a photo wall actually needs.

## Guest flow

1. Guest enters their name once (remembered in `localStorage`).
2. Picks photos — `<input type="file" accept="image/*" multiple>` opens the
   phone's own picker, camera roll included. No app, no account.
3. Each photo is resized, uploaded with a per-file progress bar, and appears on
   the wall immediately.
4. Tapping a tile opens the lightbox: **Преземи фотографија** and **Отстрани**.
   A guest can remove only their own upload — the Worker stores the SHA-256 of
   a per-photo token and compares. You (admin token) can remove anything.

Filter by guest, search by name, and the wall refreshes every 45 seconds while
someone is looking at it.

## Deploy

1. **Worker + R2** — see [`worker/README.md`](worker/README.md).
2. **This page** — any static host. Cloudflare Pages is the natural pick
   (the repo is private, and GitHub Pages would need a paid plan for that):

   ```bash
   npx wrangler pages deploy gallery --project-name wedding-gallery
   ```

   Set the folder to `gallery` so the page is the root. Then point the page at
   the Worker by setting `CONFIG.apiBase` in `gallery.js` — or run the helper:

   ```bash
   python tools/set-gallery-url.py https://your-gallery.pages.dev/ --api https://wedding-gallery.you.workers.dev
   ```

3. **Table cards** — open `qr-card.html`, print at **100% scale** with
   background graphics on. Four A6 cards per A4 sheet; cut along the guides and
   put one on each table. Each QR prints at ~33 mm, comfortably scannable.
   The cards read the same `qr.svg`, so they always match the deployed URL.

## Local development

```bash
# terminal 1 — the API (real R2, simulated locally)
cd gallery/worker && npx wrangler dev --local

# terminal 2 — the page
cd gallery && python -m http.server 8000
# then open: http://localhost:8000/?api=http://127.0.0.1:8787
```

`?api=` overrides `CONFIG.apiBase` for testing.

## Notes

- **HEIC**: iPhones may hand over HEIC, which Chrome cannot decode. Safari can.
  The upload fails with a clear message rather than silently doing nothing; if
  your guests are iPhone-heavy, consider a HEIC decoder or accept Safari-only.
- **No rate limiting** on uploads. Fine for a wedding; see the Worker README if
  you want to harden it.
- **Nothing is deleted automatically.** The photos stay in your R2 bucket —
  download them whenever you like, they're yours.
