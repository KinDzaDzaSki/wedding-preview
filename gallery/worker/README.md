# Wedding gallery — Worker + R2

The API behind the standalone guest gallery. Cloudflare Worker, photos in R2.
**No database** — metadata rides along in each object's own `customMetadata`,
so a single R2 `list()` returns everything the grid needs.

## Routes

| method | path | what it does |
|---|---|---|
| `POST` | `/api/photos` | upload — multipart with `grid`, `full`, `guest`, `caption`, `w`, `h` |
| `GET` | `/api/photos` | list, newest first (`?limit=&cursor=&guest=`) |
| `DELETE` | `/api/photos/:id` | delete — admin token **or** the uploader's own token |
| `GET` | `/i/full/<id>.jpg` · `/i/grid/<id>.jpg` | serve an image |
| `GET` | `/api/health` | liveness |

## Storage layout

```
full/<uuid>.jpg   ~1600px  the lightbox image + the download
grid/<uuid>.jpg   ~800px   the tile image
```

Both are produced **in the browser** before upload — see `../gallery.js`.
A 0.75 MB phone photo becomes a ~86 KB tile and a ~271 KB full image
(measured: 89% and 65% saved). That is the whole reason 300 guests fit in
a free tier.

## Delete tokens

Each upload returns a `deleteToken` to the uploader only; we store just its
SHA-256 hash alongside the object. A guest can therefore remove their own
mistake, and cannot touch anyone else's. The `ADMIN_TOKEN` secret removes
anything — that is your moderation lever.

## Deploy

```bash
cd gallery/worker
npx wrangler login
npx wrangler r2 bucket create wedding-photos
npx wrangler secret put ADMIN_TOKEN        # paste a long random string
npx wrangler deploy
```

Then set `ALLOWED_ORIGINS` in `wrangler.toml` to your real origins and
redeploy — `*` is convenient for testing but lets any site call the API:

```toml
[vars]
ALLOWED_ORIGINS = "https://your-gallery.pages.dev,http://localhost:8000"
```

Note down the deployed URL (`https://wedding-gallery.<subdomain>.workers.dev`)
and feed it to `../../tools/set-gallery-url.py`.

## Local development

```bash
cd gallery/worker
echo 'ADMIN_TOKEN="dev-token"' > .dev.vars     # git-ignored
npx wrangler dev --local                       # real R2, simulated locally
```

`wrangler dev --local` runs an actual local R2 — uploads, listing, deletion and
image serving all work, which is how the API was tested. Point the page at it
with `?api=http://127.0.0.1:8787`:

```
http://localhost:8000/gallery/?api=http://127.0.0.1:8787
```

## Notes and limits

- **Uploads are unauthenticated by design** — guests have no accounts. The
  defence is size caps (12 MB), real magic-byte sniffing (a `.jpg` that is not
  an image is rejected `415`), and a name field. There is **no rate limiting**;
  if you expect abuse, add a Durable Object or turnstile in front of `POST`.
- **`list()` returns up to 1000 keys per call.** The page requests `limit=1000`
  and follows `cursor` if a wedding ever exceeds that.
- **R2 is eventually consistent** for listing, so a just-uploaded photo can take
  a moment to appear for other guests. The uploader sees it immediately because
  the page reloads after its own upload.
- Free tier: **10 GB storage, 1M Class A + 10M Class B operations, egress free
  at every tier.** Sized for 300 guests × 30 photos at ~360 KB per photo
  ≈ 3.2 GB — comfortably inside it.
