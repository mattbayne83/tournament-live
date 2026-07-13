# Changelog

All notable changes to Tournament Manager are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); versions follow semver.

## [Unreleased]

### Planned
- Deploy to Cloudflare Pages (create KV namespace, paste id into `wrangler.toml`, `wrangler pages deploy`)
- Real-hardware rehearsal: laptop → TV board, phone score entry outdoors
- Nice-to-haves: `endDivision` surfaced in the UI, third-place-match toggle in setup, board pane layout tuning after seeing the real TV

## [0.2.0] — 2026-07-13

Admin-side visibility and planning tools.

### Added
- **Day planner** (`/plan`, linked from Home): simulate a division before committing to a format — runs the real pairing engines with random results, so bye rotation and playoff structure behave like game day. Timeline bar with block-end marker and fits/over verdict, games-per-team min/avg/max, sitting per round, longest sit streak. Each wizard division deep-links into it pre-filled ("Simulate this division")
- **Visual ladder** in admin: court boxes with team chips and ↑/↓/held/sat movement badges from the last round, plus the rotation queue with bye counts
- **Results feed** in admin: collapsible round-by-round log of every finished game (court, score, winner) for ladder, pools, and playoff
- **Bracket graphic** in the admin playoff panel — same BracketView as the TV board, replacing the text results list
- **Board → admin navigation**: dashboard button in the TV board header (organizer laptop only)
- **Sample teams** (testing): fill 8/16/24 pun-grade teams per division on the wizard Teams step
- `src/engine/simulate.ts` with its own Vitest suites (63 tests total); `Stepper` supports step increments

## [0.1.0] — 2026-07-13

Initial release, built plan-first for the United Way ONEOK pickleball tournament (Oct 7, 2026) and verified end-to-end with a scripted dress rehearsal (setup → two champions, remote viewers tracking, zero page errors).

### Added
- **Formats**: up/down ladder (timed rounds, lazy per-round pairing, fair bye rotation with top-court exemption, sticky-end movement) and round-robin pools → single-elim playoff; pure engines in `src/engine/` with 58 Vitest tests including full-event invariant simulations (15 teams/4 courts; 35 teams/8 courts)
- **Hybrid ladder finish**: extract the top 4 to a championship-court mini-playoff while the ladder plays on; court returns to the ladder after the final
- **Setup wizard**: divisions with per-format config, paste-in team entry, court assignment with live capacity math, drag seeding, go-live with admin key
- **Courtside dashboard**: round timer with horn, score steppers with tie-winner tap, movement preview before finalize, labeled undo (rev-safe for last-write-wins), per-match confirm for pools, up-next queue, backup export/import
- **Day-of operations**: team withdrawal (forfeits + ladder compaction), past-round corrections (stats-only default, positional replay locked after extraction), court handoff presets, live round-length edits, second-admin-tab warning
- **TV Event Board** (`/board`): broadcast-dark 1080p-at-distance layout — jumbo countdown, court map, auto-cycling standings pages, bracket pane, champion celebration, follow-along QR, fullscreen + wake lock; renders from the local store so it survives wifi outages
- **Live sync**: Cloudflare Pages Function + KV (claim-on-first-write via SHA-256 key hash, rev-regression 409, ETag/304, `X-Server-Now` clock correction); coalescing publisher (≥5 s between writes, offline backoff); `/t/:id` mobile live view and `/t/:id/board` remote board polling at 5 s
- **Design system**: "broadcast scoreboard" language — Anton + Barlow/Barlow Condensed, United Way–warm OKLCH palette, dark board / light admin (`.impeccable.md`)

### Changed
- Renamed from `pickleball-tourney` to `tournament-manager`; product generalized, the UW ONEOK event remains the flagship configuration
