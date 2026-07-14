# Tournament Manager

Tournament day manager built for the United Way ONEOK charity pickleball tournament (Oct 7, 2026) — and reusable for any event after it.

One organizer runs the whole day from a single device. A laptop at center court drives the **TV Event Board**; players and spectators follow along on their phones via a QR code.

**Live:** [tournament-live.pages.dev](https://tournament-live.pages.dev)  
**Repo:** [github.com/mattbayne83/tournament-live](https://github.com/mattbayne83/tournament-live)

## What it does

- **Two formats per division**: up/down ladder (timed rounds, fair bye rotation, hybrid top-4 championship playoff) and round-robin pools → single-elimination playoff
- **Day planner** (`/plan`): simulate a format before committing — timeline vs. the time block, games per team, sitting fairness, computed by the real pairing engines
- **Courtside score entry**: big steppers, movement preview before every ladder round commits, one-tap undo, visual ladder with movement badges, round-by-round results log, live bracket graphic
- **TV Event Board**: broadcast-style scoreboard — jumbo round countdown with horn, court map, auto-cycling standings, bracket, champion celebration
- **Live sharing**: publishes to Cloudflare KV; viewers poll a read-only mirror. The organizer device keeps working if the wifi dies
- **Day-of realities**: team withdrawals, past-round score corrections (stats-only or full positional replay), court handoffs between divisions, capacity math in the setup wizard
- **Dry-run helpers**: one-click **Load demo**, sample team fills, end/reset with confirmation dialogs

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · Zustand · wouter · Vitest · Cloudflare Pages + Functions + KV

## Local development

```bash
npm install
npm run dev          # app only (no sync API) → http://localhost:5173
npm test             # engine + store suites
npm run pages:dev    # full stack locally (Functions + simulated KV)
```

## Publish (GitHub → Cloudflare)

Live at [tournament-live.pages.dev](https://tournament-live.pages.dev) — Git-connected: **push `main`** and Cloudflare Pages builds and deploys.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| KV binding | `TOURNAMENTS` — applied automatically from `wrangler.toml` |

If ever reconnecting, use the dashboard **Pages** wizard — the default "Connect to Git" flow creates a Worker, which always fails for this repo.

Full status, troubleshooting, and event-day checklist: **[DEPLOY.md](./DEPLOY.md)**  
Architecture notes: **[CLAUDE.md](./CLAUDE.md)**

```bash
git push origin main
# emergency CLI: npm run deploy
```
