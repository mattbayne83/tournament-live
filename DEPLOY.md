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
| Cloudflare Pages project `tournament-live` | **To create as Git-connected** (dashboard wizard, see §5). CLI Direct Upload version was deleted 2026-07-14 to free the name |
| Leftover failed Worker `tournament-live` | **Deleted** 2026-07-14 (was the dashboard Git-connect attempt — that wizard creates Workers by default) |
| KV binding | `wrangler.toml` has `pages_build_output_dir` + `TOURNAMENTS`, so Git builds apply it automatically; verify under Settings → Bindings after first deploy |
| Production API smoke-test (PUT → GET → 304 → 401) | **Passed** 2026-07-14 against production KV (during the CLI deploy); re-run after Git deploy |
| In-app smoke-test (demo → live → private spectator) | Pending — needs a browser walk-through |
| Custom domain | Not set |
| Real-hardware TV/phone rehearsal | Not done |

### Critical lesson: Pages wizard vs Workers wizard

The dashboard's default **"Connect to Git"** flow creates a **Worker with Git builds**, not a Pages project — that's what produced the always-failing `tournament-live` Worker on 2026-07-14 (deleted). The tell-tale: the Workers wizard asks for a **Deploy command**; the real Pages wizard never does — it asks for **Framework preset / Build command / Build output directory**. If a wizard asks for a deploy command, back out — wrong flow.

Use: Workers & Pages → **Create** → switch to the **Pages** tab → **Connect to Git** (or Import an existing Git repository).

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

1. [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) → **Create** → switch to the **Pages** tab → **Connect to Git** / **Import an existing Git repository**
   - **Sanity check you're in the Pages wizard:** it asks for a *Build output directory* and offers *Framework presets*. If it asks for a **Deploy command**, you're in the Workers wizard — back out (see "Critical lesson" above).
2. Select **`mattbayne83/tournament-live`**
3. Production branch: **`main`**, project name **`tournament-live`**

### Build settings (Pages wizard)

| Field | Value |
|---|---|
| Framework preset | **None** (or Vite if offered — both work) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(empty — repo root is the app)* |

There is no deploy command in the Pages wizard — Pages uploads the output directory itself.

### After first green deploy

1. Check **Settings → Bindings**: `wrangler.toml` has `pages_build_output_dir`, so the `TOURNAMENTS` KV binding should be picked up from the repo automatically. If it isn't listed, add it manually:
   - Variable name: **`TOURNAMENTS`** (exact)
   - Namespace: the `TOURNAMENTS` namespace (`b4bd7e2…`), then **Retry deployment**
2. Open the project `*.pages.dev` URL
3. Smoke-test: **Load demo** → setup → **Go live** → spectator link in a private window → score a match → update within ~5s

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
