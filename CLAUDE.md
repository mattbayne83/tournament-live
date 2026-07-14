# Tournament Manager

Tournament day manager, built for the United Way ONEOK charity pickleball tournament (Oct 7, 2026) and reusable for any event. One organizer runs the day from a single device; a laptop at center court drives the TV Event Board (the flagship view); spectators can follow on phones via a shared link.

- **GitHub:** https://github.com/mattbayne83/tournament-live  
- **Full build spec:** `~/.claude/plans/prancy-wishing-gem.md`  
- **Release history / open work:** `CHANGELOG.md`  
- **Deploy status & Cloudflare settings:** `DEPLOY.md` (source of truth for publish)

## Stack

React 19 · TypeScript strict · Vite · Tailwind CSS 4 · Zustand 5 · wouter · Lucide · Vitest · Cloudflare Pages + Functions + KV.

## Architecture

- One serializable `Tournament` object is the entire domain state (`src/types/tournament.ts`). Monotonic `rev` on every commit.
- Format engines are **pure functions** in `src/engine/` (ladder, pools, bracket, standings, scheduler) with injected clock/seeded RNG — no DOM, store, or wall-clock access. All engine changes need Vitest coverage; `simulation.test.ts` drives full fake events and asserts invariants.
- Store: all mutation via `commit(label, fn)` in `src/store/` — clones, applies pure fn, bumps rev, snapshots for undo, debounce-persists to localStorage, marks dirty for the KV publisher. Score drafts live in UI state and only commit on Confirm.
- Sync: single-writer last-write-wins. Organizer device PUTs the full blob to `functions/api/t/[id].ts` (Bearer adminKey, SHA-256 stored, rev-regression 409); viewers poll GET with ETag/304. KV free tier is 1,000 writes/day — publisher must coalesce (≥5 s between writes).
- TV Event Board (`/board`) renders from the local store on the organizer laptop (works offline); `/t/:id/board` and `/t/:id` poll remotely via `useTournamentSource()`.

## Commands

- `npm run dev` / `npm run build`
- `npm test` — Vitest (engine + store suites)
- `npx tsc -b && npm run lint` — required green before any phase is called done (oxlint, not eslint)
- `npm run pages:dev` — full stack locally (Functions + simulated KV); `npm run dev` alone has no `/api`
- `npm run deploy` — CLI Pages deploy (emergency); normal path is push to `main` on GitHub

## Deploy (Cloudflare Pages)

**Live: https://tournament-live.pages.dev** — Git-connected Pages project; **push to `main`** deploys. Details and status: **`DEPLOY.md`**.

| Field | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| KV binding | `TOURNAMENTS` — auto-applied from `wrangler.toml` (`pages_build_output_dir`) |

Gotcha: the dashboard's default "Connect to Git" flow creates a **Worker** (its wizard asks for a Deploy command) — use Create → **Pages** tab instead. Emergency CLI: `npm run deploy`. SPA routes: `public/_redirects`. Lockfile includes `@emnapi/*` pins so CF Linux `npm ci` succeeds.

## Key files

- `src/types/tournament.ts` — the whole domain model; one `Tournament` blob
- `src/engine/ladder.ts` — pairing, bye rotation, movement, extraction, replay
- `src/engine/{pools,bracket,standings,scheduler}.ts` — pool draw/schedule, single-elim, tiebreak chain, court queue
- `src/engine/simulate.ts` — day-planning simulator over the real engines
- `src/store/store.ts` — `commit()` spine, undo, domain actions (incl. demo / end / reset)
- `src/store/{persistence,publisher}.ts` — localStorage autosave; coalescing KV publish loop
- `src/utils/sampleTeams.ts` — pun sample rosters for dry runs
- `functions/api/t/[id].ts` — GET/PUT sync endpoint
- `src/pages/board/` — TV Event Board; `src/pages/admin/` — organizer dashboard; `src/pages/live/` — mobile viewer; `src/pages/plan/` — day planner
- `DEPLOY.md` — publish status, CF settings, troubleshooting
- `.impeccable.md` — design context (broadcast scoreboard, Anton + Barlow, UW palette)
