import { describe, expect, it } from 'vitest'
import type { BracketState, Match } from '../../types/tournament'
import { bracketPlacement, buildBracket, reportBracketResult } from '../bracket'

const cfg = { thirdPlaceMatch: false }

function toRecord(matches: Match[]): Record<string, Match> {
  return Object.fromEntries(matches.map((m) => [m.id, m]))
}

/** Records a result and propagates it; mutates the record for test brevity. */
function play(
  state: BracketState,
  matches: Record<string, Match>,
  matchId: string,
  winner: 'a' | 'b',
): BracketState {
  matches[matchId] = { ...matches[matchId], score: winner === 'a' ? { a: 11, b: 7 } : { a: 7, b: 11 }, winner, status: 'done' }
  const { state: next, updatedMatches } = reportBracketResult(state, matches, matchId)
  for (const m of updatedMatches) matches[m.id] = m
  return next
}

describe('buildBracket', () => {
  it('seeds a 4-bracket 1v4 / 2v3', () => {
    const { state, matches } = buildBracket(['S1', 'S2', 'S3', 'S4'], 'd1', cfg)
    expect(state.size).toBe(4)
    const r1 = matches.filter((m) => m.roundIndex === 1)
    expect(r1.map((m) => [m.teamA, m.teamB])).toEqual([
      ['S1', 'S4'],
      ['S2', 'S3'],
    ])
    const final = matches.find((m) => m.bracketSlotId === 'R2-0')!
    expect([final.teamA, final.teamB]).toEqual([null, null])
  })

  it('gives top seeds byes in a 6-team field and auto-advances them', () => {
    const { state, matches } = buildBracket(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'], 'd1', cfg)
    expect(state.size).toBe(8)
    // Seeds 7 and 8 don't exist → R1-0 (1 v 8) and R1-2 (2 v 7) are byes.
    const byeSlots = state.slots.filter((s) => s.round === 1 && s.matchId === null)
    expect(byeSlots.map((s) => s.id).sort()).toEqual(['R1-0', 'R1-2'])
    const semi0 = matches.find((m) => m.bracketSlotId === 'R2-0')!
    expect(semi0.teamA).toBe('S1') // advanced through the bye at build time
    expect(semi0.teamB).toBeNull() // waits on 4 v 5
    const r1 = matches.filter((m) => m.roundIndex === 1)
    expect(r1).toHaveLength(2) // only 4v5 and 3v6 actually play
  })

  it('plays a 4-bracket through to a champion', () => {
    const built = buildBracket(['S1', 'S2', 'S3', 'S4'], 'd1', cfg)
    const matches = toRecord(built.matches)
    let state = built.state
    const semiIds = built.matches.filter((m) => m.roundIndex === 1).map((m) => m.id)
    state = play(state, matches, semiIds[0], 'a') // S1 over S4
    state = play(state, matches, semiIds[1], 'b') // S3 over S2
    const final = Object.values(matches).find((m) => m.bracketSlotId === 'R2-0')!
    expect([final.teamA, final.teamB]).toEqual(['S1', 'S3'])
    state = play(state, matches, final.id, 'b')
    expect(state.championId).toBe('S3')
  })

  it('feeds semifinal losers into a 3rd-place match', () => {
    const built = buildBracket(['S1', 'S2', 'S3', 'S4'], 'd1', { thirdPlaceMatch: true })
    const matches = toRecord(built.matches)
    let state = built.state
    const semiIds = built.matches.filter((m) => m.roundIndex === 1 && m.bracketSlotId !== '3P').map((m) => m.id)
    state = play(state, matches, semiIds[0], 'a')
    state = play(state, matches, semiIds[1], 'a')
    const third = Object.values(matches).find((m) => m.bracketSlotId === '3P')!
    expect([third.teamA, third.teamB].sort()).toEqual(['S3', 'S4'])
    expect(state.championId).toBeNull()
  })
})

describe('bracketPlacement', () => {
  it('places 1-4 using pre-extraction seeds when no 3rd-place game', () => {
    const built = buildBracket(['S1', 'S2', 'S3', 'S4'], 'd1', cfg)
    const matches = toRecord(built.matches)
    let state = built.state
    const semiIds = built.matches.filter((m) => m.roundIndex === 1).map((m) => m.id)
    state = play(state, matches, semiIds[0], 'b') // S4 over S1
    state = play(state, matches, semiIds[1], 'a') // S2 over S3
    const final = Object.values(matches).find((m) => m.bracketSlotId === 'R2-0')!
    state = play(state, matches, final.id, 'a') // S4 champion
    expect(bracketPlacement(state, matches, ['S1', 'S2', 'S3', 'S4'])).toEqual(['S4', 'S2', 'S1', 'S3'])
  })

  it('returns empty until the final is decided', () => {
    const built = buildBracket(['S1', 'S2'], 'd1', cfg)
    expect(bracketPlacement(built.state, toRecord(built.matches), [])).toEqual([])
  })
})
