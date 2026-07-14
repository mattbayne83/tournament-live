# Deploy: GitHub + Cloudflare Pages

This app is a static Vite SPA plus one Pages Function (`functions/api/t/[id].ts`) that stores tournament blobs in **KV**. Live spectator sync only works after Cloudflare is configured.

**Canonical GitHub repo:** [github.com/mattbayne83/tournament-live](https://github.com/mattbayne83/tournament-live)  
**Local folder name:** `tournament-manager` (product name stays “Tournament Manager”; Pages/project name aligns with the repo: `tournament-live`)

---

## Status (as of 2026-07-14)

| Item | State |
|---|---|
| App features (demo load, end/reset, planner, engines) | Done in repo |
| GitHub repo `mattbayne83/tournament-live` | Connected; push `main` to publish |
| `wrangler` login (local) | Working (`mattbayne@gmail.com`) |
| KV namespace `TOURNAMENTS` | **Created** — id `b4bd7e2dd1c14fc6bf46a627d231c305` in `wrangler.toml` |
| SPA redirects | `public/_redirects` → `/* /index.html 200` |
| Lockfile for CF `npm ci` | Fixed — pin `@emnapi/core` + `@emnapi/runtime` as devDeps so Linux clean-install works |
| Cloudflare Pages project `tournament-live` | **LIVE** — created 2026-07-14 via CLI (Direct Upload), <https://tournament-live.pages.dev> |
| KV binding on Pages project | **Working** — applied automatically from `wrangler.toml` on `pages deploy` |
| Production API smoke-test (PUT → GET → 304 → 401) | **Passed** 2026-07-14 against production KV |
| In-app smoke-test (demo → live → private spectator) | Pending — needs a browser walk-through |
| Git-connected auto-deploy | **Not active** — project is Direct Upload; publish with `npm run deploy` (see note below) |
| Custom domain | Not set |
| Real-hardware TV/phone rehearsal | Not done |

### How it's actually published (2026-07-14)

The live site is a **Pages project** created via CLI (Direct Upload). Publish with:

```bash
npm run deploy    # build + npx wrangler pages deploy dist; applies KV binding from wrangler.toml
```

Pushing to GitHub does **not** auto-deploy. If Git auto-deploy is wanted later: delete the Direct Upload Pages project, then dashboard → **Create → Pages → Connect to Git** (not the default Workers flow) and re-add the KV binding.

### Leftover Worker — safe to delete

The dashboard also shows a **Worker** named `tournament-live` connected to `mattbayne83/tournament-live` with a failed build. That was the earlier dashboard "Connect to Git" attempt — the modern CF dashboard creates a **Worker with Git builds** by default, and this repo isn't a Worker, so its build always fails. It has no URLs, no bindings, and 0 invocations. It is inert but will re-run (and fail) on every push to `main`. Delete it in the dashboard (Worker → Settings → Delete) to stop the noise. Pages and Workers have separate namespaces, so the Pages project keeps the name.

### Not this app

`https://tournament-manager.pages.dev` is a **different** project (“bert & erne”). This product should ship under the **tournament-live** Pages project URL (title **Tournament Manager**, Anton/Barlow fonts).

---

## 0. Prerequisites

| Tool | Check |
|---|---|
| Node 20+ (CF build uses 22) | `node -v` |
| Wrangler | `wrangler --version` / `npx wrangler` |
| Cloudflare account | [dash.cloudflare.com](https://dash.cloudflare.com) |
| GitHub | remote → `mattbayne83/tournament-live` |

Local app only (no live sync):

```bash
npm install
npm run dev          # http://localhost:5173
```

Full stack locally (Functions + simulated KV):

```bash
npm run pages:dev    # builds then serves (often :8788)
```

---

## 1. GitHub

```bash
cd /Users/mattbayne/Documents/SoftwareProjects/tournament-manager
git remote -v   # should be git@github.com:mattbayne83/tournament-live.git
git push -u origin main
```

Day-to-day: **push to `main` → Cloudflare rebuilds** (once the Pages project is connected).

---

## 2. Cloudflare login (one-time, local CLI)

```bash
wrangler login
wrangler whoami
```

---

## 3. KV namespace (done once)

```bash
npm run kv:create
# wrangler kv namespace create TOURNAMENTS
```

**Current production id** (already in `wrangler.toml`):

```toml
[[kv_namespaces]]
binding = "TOURNAMENTS"
id = "b4bd7e2dd1c14fc6bf46a627d231c305"
```

- Namespace **id** is safe to commit (resource id, not a secret).
- Admin keys are client-generated per tournament and never stored in git.
- **Git-connected Pages still need a dashboard binding** with the exact name `TOURNAMENTS` (see §5). CLI deploys read `wrangler.toml`; dashboard deploys use **Settings → Bindings**.

---

## 4. Deploy via CLI (optional / emergency)

```bash
npm run deploy
# npm run build && wrangler pages deploy dist
```

Uses project name from `wrangler.toml` (`tournament-live`). Prefer Git → CF for normal work.

---

## 5. GitHub → Cloudflare Pages (primary path)

### Dashboard: create / connect

1. [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → **Create** → **Pages** → **Connect to Git**
2. Select **`mattbayne83/tournament-live`**
3. Production branch: **`main`**

### Build settings (exact field names in the UI)

Some CF UIs label the output folder **Path** instead of “Build output directory.”

| Field | Value | Notes |
|---|---|---|
| **Build command** | `npm run build` | Runs `tsc -b && vite build` |
| **Path** | `dist` | **Yes — `dist` goes here.** Vite output folder uploaded as the site |
| **Deploy command** | `npx wrangler pages deploy dist` | Required in current UI; **must** be `pages deploy`, not plain `wrangler deploy` |
| **Non-prod branch deploy command** | `npx wrangler pages deploy dist` | Same as production is fine |
| Root directory (if separate) | *(empty)* | Repo root is the app |

#### Wrong vs right deploy command

| Command | Result |
|---|---|
| `npx wrangler deploy` | **Fails** — Workers entrypoint expected; Pages project warning |
| `npx wrangler pages deploy dist` | **Correct** for this repo |

If the UI forces a non-empty deploy command, always use the **pages** form.

### After first green deploy

1. **Settings → Bindings → KV namespace**
   - Variable name: **`TOURNAMENTS`** (exact)
   - Namespace: the `TOURNAMENTS` namespace (`b4bd7e2…`)
2. **Retry deployment** (or push) so the binding is live
3. Open the project `*.pages.dev` URL
4. Smoke-test: **Load demo** → setup → **Go live** → spectator link in a private window → score a match → update within ~5s

### What “green” looks like in logs

```text
Installing project dependencies: npm clean-install ...
added N packages ...
> tournament-manager@0.2.0 build
✓ built in ...
npx wrangler pages deploy dist
... Success / Deployed ...
```

---

## 6. Lessons learned (2026-07-14 first deploy)

### `npm ci` / lockfile (`Missing: @emnapi/core@…`)

- Cloudflare runs **`npm clean-install` (`npm ci`)** on Linux.
- Vite/Rolldown/Tailwind optional **wasm** peers need full lockfile entries for `@emnapi/core` and `@emnapi/runtime`.
- Fix in repo: pin both as **devDependencies** and keep `package-lock.json` in sync.
- After changing deps: run `npm install` / `npm ci` locally, commit **both** `package.json` and `package-lock.json`, then push.

### Deploy command vs Path

- **Path** = build **output** (`dist`), not the repo root.
- **Deploy command** ≠ Path. Path tells CF which folder is the site; deploy command publishes it (when the UI requires one).

### Do not confuse with other Pages projects

- Other apps on the same CF account (e.g. an older `tournament-manager` / “bert & erne” site) are unrelated.
- Confirm production by page title **Tournament Manager** and this repo’s UI.

---

## 7. Custom domain (optional)

Pages project → **Custom domains** → add hostname. DNS on Cloudflare (or follow CNAME instructions).

---

## 8. Event-day checklist

- [ ] Production URL opens **Tournament Manager** (this app)
- [ ] KV binding `TOURNAMENTS` present on the Pages project
- [ ] Demo dry-run: go live → second device polls `/t/:id` → scores update
- [ ] Admin **Backup** JSON downloaded before the real event
- [ ] Organizer laptop is source of truth if venue wifi dies (`/board` uses local store)
- [ ] KV free tier = **1,000 writes/day**; publisher ≥5s between writes (~300–500/event). Consider **Workers Paid ($5/mo)** before Oct 7
- [ ] Real-hardware: laptop → TV board, phone scoring outdoors

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm ci` / Missing `@emnapi/…` | Regenerate lockfile; keep emnapi pins; commit lock + push |
| `Missing entry-point to Worker script` | Deploy command is `wrangler deploy` → change to `npx wrangler pages deploy dist` |
| Build OK, deploy fails interactively | Use non-interactive `pages deploy dist`; don’t use plain `deploy` |
| `/admin` 404 on refresh | `public/_redirects` must ship in `dist/_redirects` |
| Spectator never updates / API 404 | Function not live or **KV binding** missing/misnamed (`TOURNAMENTS`) |
| PUT 401 wrong admin key | First writer claims the id; same device/key or new tournament |
| PUT 409 stale rev | Two admin tabs — close one |
| Site is wrong product | Wrong Pages project URL — use the one linked to `tournament-live` |

---

## Commands cheat sheet

```bash
npm install
npm test
npm run build
npm run pages:dev              # local full stack
wrangler login
npm run kv:create              # once (already done for prod id)
npm run deploy                 # CLI emergency path
git push origin main           # primary: triggers CF Git build
```
