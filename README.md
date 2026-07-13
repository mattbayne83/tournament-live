# Tournament Manager

Tournament day manager built for the United Way ONEOK charity pickleball tournament (Oct 7, 2026) — and reusable for any event after it.

One organizer runs the whole day from a single device. A laptop at center court drives the **TV Event Board**; players and spectators follow along on their phones via a QR code.

## What it does

- **Two formats per division**: up/down ladder (timed rounds, fair bye rotation, hybrid top-4 championship playoff) and round-robin pools → single-elimination playoff
- **Courtside score entry**: big steppers, movement preview before every ladder round commits, one-tap undo
- **TV Event Board**: broadcast-style scoreboard — jumbo round countdown with horn, court map, auto-cycling standings, bracket, champion celebration
- **Live sharing**: publishes to Cloudflare KV; viewers poll a read-only mirror. The organizer device keeps working if the wifi dies
- **Day-of realities**: team withdrawals, past-round score corrections (stats-only or full positional replay), court handoffs between divisions, capacity math in the setup wizard

## Stack

React 19 · TypeScript · Vite · Tailwind 4 · Zustand · wouter · Vitest · Cloudflare Pages + Functions + KV

```bash
npm install
npm run dev          # app only (no sync API)
npm test             # engine + store suites
npm run build && npx wrangler pages dev dist   # full stack locally
```

See `CLAUDE.md` for architecture and deploy notes.
