# Tournament Manager

Tournament day manager, built for the United Way ONEOK charity pickleball tournament (Oct 7, 2026) and reusable for any event. One organizer runs the day from a single device; a laptop at center court drives the TV Event Board (the flagship view); spectators can follow on phones via a shared link.

Full build spec: `~/.claude/plans/prancy-wishing-gem.md`. Release history and open work: `CHANGELOG.md` (deployment to CF Pages is still pending — see Unreleased).

## Stack

React 19 · TypeScript strict · Vite 7 · Tailwind CSS 4 · Zustand 5 · wouter · Lucide · Vitest. Deploys to Cloudflare Pages; live sync via Pages Functions + KV.

## Architecture

- One serializable `Tournament` object is the entire domain state (`src/types/tournament.ts`). Monotonic `rev` on every commit.
- Format engines are **pure functions** in `src/engine/` (ladder, pools, bracket, standings, scheduler) with injected clock/seeded RNG — no DOM, store, or wall-clock access. All engine changes need Vitest coverage; `simulation.test.ts` drives full fake events and asserts invariants.
- Store: all mutation via `commit(label, fn)` in `src/store/` — clones, applies pure fn, bumps rev, snapshots for undo, debounce-persists to localStorage, marks dirty for the KV publisher. Score drafts live in UI state and only commit on Confirm.
- Sync: single-writer last-write-wins. Organizer device PUTs the full blob to `functions/api/t/[id].ts` (Bearer adminKey, SHA-256 stored, rev-regression 409); viewers poll GET with ETag/304. KV free tier is 1,000 writes/day — publisher must coalesce (≥5 s between writes).
- TV Event Board (`/board`) renders from the local store on the organizer laptop (works offline); `/t/:id/board` and `/t/:id` poll remotely via `useTournamentSource()`.

## Commands

- `npm run dev` / `npm run build`
- `npm test` — Vitest (engine + store suites)
- `npx tsc -b && npm run lint` — required green before any phase is called done (oxlint, not eslint — new Vite template default)
- `npx wrangler pages dev dist` — full stack locally (Functions + simulated KV on :8788); `npm run dev` alone has no `/api`

## Deploy (Cloudflare Pages)

Full walkthrough: `DEPLOY.md`. Short path:

1. `wrangler login` then `npm run kv:create` → paste the id into `wrangler.toml`
2. `npm run deploy` (build + `wrangler pages deploy dist`)
3. KV free tier is 1,000 writes/day; the publisher coalesces to ≥5s between writes (~300–500 writes per event). Consider Workers Paid before event day as insurance.

SPA client routes need `public/_redirects` (`/* → /index.html 200`); Functions under `/api/*` still win.

## Key files

- `src/types/tournament.ts` — the whole domain model; one `Tournament` blob
- `src/engine/ladder.ts` — pairing, bye rotation, movement, extraction, replay
- `src/engine/{pools,bracket,standings,scheduler}.ts` — pool draw/schedule, single-elim, tiebreak chain, court queue
- `src/engine/simulate.ts` — day-planning simulator (timeline segments, games/team, sitting stats) over the real engines
- `src/store/store.ts` — `commit()` spine, undo, all domain actions
- `src/store/{persistence,publisher}.ts` — localStorage autosave; coalescing KV publish loop
- `functions/api/t/[id].ts` — GET/PUT sync endpoint (claim-on-first-write, rev 409, ETag)
- `src/pages/board/` — TV Event Board (flagship); `src/pages/admin/` — organizer dashboard (incl. `LadderViz`, `ResultsFeed`, `PlayoffStrip`, `ManagePanel`); `src/pages/live/` — mobile viewer; `src/pages/plan/Planner.tsx` — day planner (`/plan`, query-param deep links from the wizard)
- `.impeccable.md` — design context (broadcast scoreboard, Anton + Barlow, UW palette)
