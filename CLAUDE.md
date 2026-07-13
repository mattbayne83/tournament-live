# Pickleball Tourney

Tournament day manager, built for the United Way ONEOK charity pickleball tournament (Oct 7, 2026) and reusable for any event. One organizer runs the day from a single device; a laptop at center court drives the TV Event Board (the flagship view); spectators can follow on phones via a shared link.

Full build spec: `~/.claude/plans/prancy-wishing-gem.md`.

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
- `npm test` — Vitest (engine suites)
- `npx tsc -b && npx eslint . --max-warnings 0` — required green before any phase is called done

## Key files

(fill in as the project grows)
