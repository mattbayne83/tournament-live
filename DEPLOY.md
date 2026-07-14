# Deploy: GitHub + Cloudflare Pages

This app is a static Vite SPA plus one Pages Function (`functions/api/t/[id].ts`) that stores tournament blobs in **KV**. Live spectator sync only works after Cloudflare is configured.

---

## 0. Prerequisites

| Tool | Check |
|---|---|
| Node 20+ | `node -v` |
| Wrangler | `wrangler --version` (or use `npx wrangler`) |
| Cloudflare account | [dash.cloudflare.com](https://dash.cloudflare.com) — free plan is fine to start |
| GitHub CLI (optional) | `gh auth status` |

Local app only (no live sync):

```bash
npm install
npm run dev          # http://localhost:5173
```

Full stack locally (Functions + simulated KV):

```bash
npm run pages:dev    # builds then serves on :8788
```

---

## 1. GitHub (you push)

Repo is expected at: **https://github.com/mattbayne83/tournament-manager**

If the remote is not set yet:

```bash
cd /Users/mattbayne/Documents/SoftwareProjects/tournament-manager
git remote add origin git@github.com:mattbayne83/tournament-manager.git
# or: git remote set-url origin git@github.com:mattbayne83/tournament-manager.git
```

Push when ready:

```bash
git push -u origin main
```

Suggested GitHub settings after first push:

- **About** → description: “Courtside tournament day manager (ladder + pools) with TV board and live sync”
- Optional: enable **Issues** for event-day bugs
- Visibility: **Private** until you’re ready to share; public is fine either way (no secrets live in the repo)

---

## 2. Cloudflare login (one-time)

In a terminal **on your machine** (opens a browser):

```bash
wrangler login
wrangler whoami
```

You should see your Cloudflare email/account. If `whoami` fails, re-run login.

---

## 3. Create the KV namespace

```bash
npm run kv:create
# same as: wrangler kv namespace create TOURNAMENTS
```

Copy the **id** from the output (looks like `a1b2c3d4e5f6…`) and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "TOURNAMENTS"
id = "PASTE_REAL_ID_HERE"
```

Optional local preview namespace (only needed if you use `wrangler pages dev` with real remote KV):

```bash
wrangler kv namespace create TOURNAMENTS --preview
# then set preview_id in wrangler.toml next to id
```

**Do not commit secrets.** The KV *namespace id* is not secret (it’s a resource id); the admin key is client-generated per tournament and never stored in git.

---

## 4. Deploy to Cloudflare Pages (CLI)

```bash
npm run deploy
# same as: npm run build && wrangler pages deploy dist
```

Wrangler will:

1. Upload `dist/` (static SPA)
2. Bundle `functions/` (the `/api/t/:id` sync endpoint)
3. Bind `TOURNAMENTS` KV from `wrangler.toml`

On first deploy it may ask to create a **Pages project** named `tournament-manager`. Accept the default.

You’ll get a URL like:

```text
https://tournament-manager.<your-subdomain>.pages.dev
```

Open it, load a demo tournament, go live, open the spectator link in a private window — scores should appear after the publisher’s ~5s coalesce.

---

## 5. Optional: connect GitHub → Cloudflare (auto-deploy on push)

If you prefer dashboard builds instead of `npm run deploy`:

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Select `mattbayne83/tournament-manager`
3. Build settings:

| Field | Value |
|---|---|
| Framework preset | Vite (or None) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (default) |

4. **Settings → Functions** — Pages auto-picks up the `functions/` directory from the repo.
5. **Settings → Bindings → KV namespace** → add binding name `TOURNAMENTS` → select the namespace you created.
6. Save and redeploy.

**Note:** Dashboard KV bindings and `wrangler.toml` should point at the **same** namespace id. If you use both CLI deploys and Git deploys, keep them in sync.

---

## 6. Custom domain (optional)

Cloudflare Dashboard → your Pages project → **Custom domains** → add e.g. `tourney.yourdomain.com`. DNS must be on Cloudflare (or follow their CNAME instructions).

---

## 7. Event-day checklist

- [ ] `wrangler whoami` still works on the laptop that deploys
- [ ] KV namespace id is real (not `placeholder-create-me`)
- [ ] Fresh `npm run deploy` after the last code change
- [ ] Demo dry-run on the production URL (go live → second device polls `/t/:id`)
- [ ] Download a JSON **Backup** from Admin before the real event
- [ ] KV free tier = **1,000 writes/day**; publisher coalesces ≥5s (~300–500 writes per event). Consider **Workers Paid ($5/mo)** as insurance for Oct 7
- [ ] Organizer laptop is source of truth if venue wifi dies; board on `/board` uses local store

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `/admin` 404 on refresh | Confirm `public/_redirects` is in the build (`dist/_redirects`) |
| Spectator link stuck / 404 API | Function not deployed or KV binding missing — check Pages → Functions + Bindings |
| PUT 401 wrong admin key | First writer claims the tournament id; use the same device/key or a new tournament id |
| PUT 409 stale rev | Two admin tabs publishing — close one (app also warns) |
| `wrangler` not logged in | `wrangler login` |
| Build fails in CF Git | Node version: set env `NODE_VERSION=22` in Pages project settings if needed |

---

## Commands cheat sheet

```bash
npm install
npm test
npm run build
npm run pages:dev          # local full stack
wrangler login
npm run kv:create          # once
# edit wrangler.toml with the KV id
npm run deploy             # production
```
