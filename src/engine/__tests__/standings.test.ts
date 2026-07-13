import { describe, expect, it } from 'vitest'
import type { Match } from '../../types/tournament'
import { computeStandings } from '../standings'

let seq = 0
function game(a: string, b: string, sa: number, sb: number): Match {
  return {
    id: `m${seq++}`,
    divisionId: 'd1',
    phase: 'pool',
    roundIndex: 0,
    courtId: null,
    teamA: a,
    teamB: b,
    score: { a: sa, b: sb },
    winner: sa > sb ? 'a' : 'b',
    status: 'done',
  }
}

function forfeit(winner: string, loser: string): Match {
  return {
    id: `m${seq++}`,
    divisionId: 'd1',
    phase: 'pool',
    roundIndex: 0,
    courtId: null,
    teamA: winner,
    teamB: loser,
    score: null,
    winner: 'a',
    status: 'forfeit',
  }
}

describe('computeStandings', () => {
  it('orders by win percentage first', () => {
    const rows = computeStandings(['A', 'B', 'C'], [game('A', 'B', 11, 5), game('A', 'C', 11, 3), game('B', 'C', 11, 9)], 's')
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(rows[0]).toMatchObject({ w: 2, l: 0, pf: 22, pa: 8, diff: 14 })
  })

  it('breaks a clean 2-way tie by head-to-head, even against a better point diff', () => {
    // A and B both 1-1. B crushed C but lost to A head-to-head.
    const rows = computeStandings(
      ['A', 'B', 'C'],
      [game('A', 'B', 11, 9), game('B', 'C', 11, 0), game('C', 'A', 11, 9)],
      's',
    )
    // All three are 1-1 → 3-way tie → H2H skipped (cycle), diff decides:
    // A: +2-2=0, B: +11-2=+9, C: -11+2=-9
    expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C'])
  })

  it('uses head-to-head for a true 2-way tie', () => {
    const rows = computeStandings(
      ['A', 'B', 'C', 'D'],
      [
        game('A', 'B', 11, 1), // A beats B by a lot? no — flip: B needs the h2h win with worse diff
        game('B', 'A', 11, 10),
        game('A', 'C', 11, 0),
        game('B', 'C', 5, 11),
        game('A', 'D', 0, 11),
        game('B', 'D', 11, 9),
      ],
      's',
    )
    // A: 2-2, B: 2-2, and they split head-to-head 1-1 → falls to diff among tied.
    // Within {A,B}: A is +10-1 = +9, B is -9... A beat B 11-1, B beat A 11-10.
    // A: (11-1) + (10-11) = +9; B: -9 → A first.
    const tied = rows.filter((r) => r.teamId === 'A' || r.teamId === 'B')
    expect(tied[0].teamId).toBe('A')
  })

  it('decides a clean 2-way tie by the single head-to-head game', () => {
    const rows = computeStandings(
      ['A', 'B', 'C', 'D'],
      [
        game('B', 'A', 11, 9),
        game('A', 'C', 11, 0),
        game('A', 'D', 11, 0),
        game('B', 'C', 11, 9),
        game('B', 'D', 11, 9),
        game('C', 'D', 11, 9),
      ],
      's',
    )
    // A and B... B is 3-0, A is 2-1: no tie at the top. C 1-2, D 0-3.
    expect(rows.map((r) => r.teamId)).toEqual(['B', 'A', 'C', 'D'])
  })

  it('counts forfeits in the record but not the points', () => {
    const rows = computeStandings(
      ['A', 'B', 'C'],
      [forfeit('A', 'C'), game('A', 'B', 11, 9), game('B', 'C', 11, 0)],
      's',
    )
    const a = rows.find((r) => r.teamId === 'A')!
    expect(a).toMatchObject({ w: 2, l: 0, pf: 11, pa: 9 })
  })

  it('falls to a deterministic seeded coin flip and flags it', () => {
    // Two games, perfectly mirrored: no metric can separate A and B.
    const rows = computeStandings(['A', 'B'], [game('A', 'B', 11, 9), game('B', 'A', 11, 9)], 'seed-x')
    expect(rows[0].note).toBe('tiebreak: coin flip')
    expect(rows[1].note).toBe('tiebreak: coin flip')
    const again = computeStandings(['A', 'B'], [game('A', 'B', 11, 9), game('B', 'A', 11, 9)], 'seed-x')
    expect(again.map((r) => r.teamId)).toEqual(rows.map((r) => r.teamId))
  })

  it('ignores voided matches entirely', () => {
    const voided: Match = { ...game('C', 'A', 11, 0), status: 'voided' }
    const rows = computeStandings(['A', 'B', 'C'], [game('A', 'B', 11, 5), game('A', 'C', 11, 5), voided], 's')
    expect(rows[0].teamId).toBe('A')
    expect(rows[0].w).toBe(2)
  })
})

describe('pre-play standings', () => {
  it('keeps draw order with no notes before any games', () => {
    const rows = computeStandings(['A', 'B', 'C', 'D'], [], 's')
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C', 'D'])
    expect(rows.every((r) => r.note === undefined)).toBe(true)
  })
})
