import { describe, expect, it } from 'vitest'
import type { LadderConfig, Match, MatchResult } from '../../types/tournament'
import {
  applyRoundResults,
  extractPlayoff,
  ladderStandings,
  pairNextRound,
  pauseTimer,
  remainingSec,
  removeTeam,
  replayLadder,
  resumeTimer,
  seedLadder,
  startTimer,
} from '../ladder'

const cfg: LadderConfig = {
  roundMinutes: 12,
  tieRule: 'suddenDeathPoint',
  exemptTopCourtFromByes: true,
  playoffTopN: 4,
}

const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`)

/** Turn a round's matches into results given the set of winning teams. */
function resultsFor(matches: Match[], winners: Set<string>, score = { win: 11, lose: 7 }): MatchResult[] {
  return matches.map((m) => {
    const aWins = winners.has(m.teamA!)
    if (!aWins && !winners.has(m.teamB!)) throw new Error(`no winner for ${m.id}`)
    return {
      matchId: m.id,
      courtId: m.courtId!,
      a: m.teamA!,
      b: m.teamB!,
      score: aWins ? { a: score.win, b: score.lose } : { a: score.lose, b: score.win },
      winner: aWins ? 'a' : 'b',
    }
  })
}

describe('pairing', () => {
  it('fills courts in rank order with no sitters at exact capacity', () => {
    const s = seedLadder(teams(8), cfg)
    const { state, newMatches } = pairNextRound(s, 'd1', [1, 2, 3, 4], cfg)
    expect(state.currentSitters).toEqual([])
    expect(newMatches.map((m) => [m.teamA, m.teamB, m.courtId])).toEqual([
      ['T1', 'T2', 1],
      ['T3', 'T4', 2],
      ['T5', 'T6', 3],
      ['T7', 'T8', 4],
    ])
  })

  it('uses only as many courts as needed when under capacity', () => {
    const s = seedLadder(teams(4), cfg)
    const { newMatches } = pairNextRound(s, 'd1', [1, 2, 3, 4], cfg)
    expect(newMatches).toHaveLength(2)
    expect(newMatches.map((m) => m.courtId)).toEqual([1, 2])
  })

  it('sits an odd team out even when courts are plentiful', () => {
    const s = seedLadder(teams(5), cfg)
    const { state, newMatches } = pairNextRound(s, 'd1', [1, 2, 3], cfg)
    expect(newMatches).toHaveLength(2)
    expect(state.currentSitters).toHaveLength(1)
  })

  it('exempts the top-court pair from byes', () => {
    const s = seedLadder(teams(6), cfg)
    const { state } = pairNextRound(s, 'd1', [1, 2], cfg)
    expect(state.currentSitters).toHaveLength(2)
    expect(state.currentSitters).not.toContain('T1')
    expect(state.currentSitters).not.toContain('T2')
  })
})

describe('movement', () => {
  it('moves winners up and losers down with sticky ends', () => {
    // Courts: [T1,T2] [T3,T4] [T5,T6]; all lower teams win.
    const s0 = seedLadder(teams(6), cfg)
    const { state, newMatches } = pairNextRound(s0, 'd1', [1, 2, 3], cfg)
    const s1 = applyRoundResults(state, resultsFor(newMatches, new Set(['T2', 'T4', 'T6'])))
    expect(s1.order).toEqual(['T2', 'T4', 'T1', 'T6', 'T3', 'T5'])
  })

  it('keeps a stable ladder when all upper teams win', () => {
    const s0 = seedLadder(teams(6), cfg)
    const { state, newMatches } = pairNextRound(s0, 'd1', [1, 2, 3], cfg)
    const s1 = applyRoundResults(state, resultsFor(newMatches, new Set(['T1', 'T3', 'T5'])))
    expect(s1.order).toEqual(['T1', 'T3', 'T2', 'T5', 'T4', 'T6'])
  })

  it('handles a single court (winner stays, loser stays... put)', () => {
    const s0 = seedLadder(teams(2), cfg)
    const { state, newMatches } = pairNextRound(s0, 'd1', [1], cfg)
    const s1 = applyRoundResults(state, resultsFor(newMatches, new Set(['T2'])))
    expect(s1.order).toEqual(['T2', 'T1'])
  })

  it('freezes sitter ranks in place', () => {
    const s0 = seedLadder(teams(6), cfg)
    // Only one court: T1,T2 play (top-court exemption), 4 teams sit frozen.
    const { state, newMatches } = pairNextRound(s0, 'd1', [1], cfg)
    expect(state.currentSitters.sort()).toEqual(['T3', 'T4', 'T5', 'T6'])
    const s1 = applyRoundResults(state, resultsFor(newMatches, new Set(['T2'])))
    expect(s1.order).toEqual(['T2', 'T1', 'T3', 'T4', 'T5', 'T6'])
  })

  it('accumulates stats and bye ledger', () => {
    const s0 = seedLadder(teams(5), cfg)
    const { state, newMatches } = pairNextRound(s0, 'd1', [1, 2], cfg)
    const sitter = state.currentSitters[0]
    const s1 = applyRoundResults(state, resultsFor(newMatches, new Set(['T1', 'T4'])))
    expect(s1.stats['T1']).toEqual({ w: 1, l: 0, pf: 11, pa: 7 })
    expect(s1.byeCounts[sitter]).toBe(1)
    expect(s1.lastByeRound[sitter]).toBe(0)
    expect(s1.roundIndex).toBe(1)
    expect(s1.history).toHaveLength(1)
  })
})

describe('bye fairness', () => {
  it('rotates byes so nobody sits twice before everyone eligible sat once', () => {
    // 6 teams, 2 courts → 2 sit per round; top court exempt → 4 eligible.
    let s = seedLadder(teams(6), cfg)
    const satOnce = new Set<string>()
    for (let round = 0; round < 2; round++) {
      const { state, newMatches } = pairNextRound(s, 'd1', [1, 2], cfg)
      for (const t of state.currentSitters) {
        expect(satOnce.has(t)).toBe(false)
        satOnce.add(t)
      }
      s = applyRoundResults(state, resultsFor(newMatches, new Set(newMatches.map((m) => m.teamA!))))
    }
    expect(satOnce.size).toBe(4)
  })
})

describe('playoff extraction', () => {
  it('pulls the top 4, compacts the ladder, and freezes seeds', () => {
    const s0 = seedLadder(teams(10), cfg)
    const s1 = extractPlayoff(s0, 1, cfg)
    expect(s1.playoff?.extractedIds).toEqual(['T1', 'T2', 'T3', 'T4'])
    expect(s1.playoff?.preExtractionSeeds).toEqual(['T1', 'T2', 'T3', 'T4'])
    expect(s1.playoff?.championshipCourt).toBe(1)
    expect(s1.order).toEqual(['T5', 'T6', 'T7', 'T8', 'T9', 'T10'])
  })

  it('refuses when too few teams would remain', () => {
    expect(() => extractPlayoff(seedLadder(teams(5), cfg), 1, cfg)).toThrow()
  })

  it('standings put playoff teams on top', () => {
    const s1 = extractPlayoff(seedLadder(teams(8), cfg), 1, cfg)
    const rows = ladderStandings(s1, ['T2', 'T1', 'T3', 'T4'])
    expect(rows.map((r) => r.teamId).slice(0, 5)).toEqual(['T2', 'T1', 'T3', 'T4', 'T5'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('withdrawal', () => {
  it('removes a team between rounds and pairs without it', () => {
    const s0 = removeTeam(seedLadder(teams(5), cfg), 'T3')
    expect(s0.order).toEqual(['T1', 'T2', 'T4', 'T5'])
    const { state, newMatches } = pairNextRound(s0, 'd1', [1, 2], cfg)
    expect(state.currentSitters).toEqual([])
    expect(newMatches.flatMap((m) => [m.teamA, m.teamB])).not.toContain('T3')
  })
})

describe('replay', () => {
  function playRounds(n: number, teamCount: number, courts: number[]) {
    let s = seedLadder(teams(teamCount), cfg)
    for (let i = 0; i < n; i++) {
      const { state, newMatches } = pairNextRound(s, 'd1', courts, cfg)
      // Lower-ranked team wins on even rounds — plenty of churn.
      const winners = new Set(newMatches.map((m) => (i % 2 === 0 ? m.teamB! : m.teamA!)))
      s = applyRoundResults(state, resultsFor(newMatches, winners))
    }
    return s
  }

  it('folding unmodified records reproduces live state exactly', () => {
    const live = playRounds(5, 7, [1, 2, 3])
    const replayed = replayLadder(teams(7), cfg, live.history)
    expect(replayed.order).toEqual(live.order)
    expect(replayed.stats).toEqual(live.stats)
    expect(replayed.byeCounts).toEqual(live.byeCounts)
    expect(replayed.roundIndex).toBe(live.roundIndex)
  })

  it('a corrected winner changes positions and stats coherently', () => {
    const live = playRounds(3, 6, [1, 2, 3])
    const corrected = structuredClone(live.history)
    // Flip the final round's top-court result — the new winner must now lead.
    const flip = corrected[2].results[0]
    const newWinner = flip.winner === 'a' ? flip.b : flip.a
    const oldWinner = flip.winner === 'a' ? flip.a : flip.b
    flip.winner = flip.winner === 'a' ? 'b' : 'a'
    flip.score = { a: flip.score.b, b: flip.score.a }
    const replayed = replayLadder(teams(6), cfg, corrected)
    expect(replayed.order[0]).toBe(newWinner)
    expect(replayed.order).not.toEqual(live.order)
    expect(replayed.stats[newWinner].w).toBe(live.stats[newWinner].w + 1)
    expect(replayed.stats[oldWinner].w).toBe(live.stats[oldWinner].w - 1)
  })
})

describe('timer', () => {
  it('start/pause/resume keeps remaining time honest', () => {
    let t = seedLadder(teams(4), cfg).timer
    expect(remainingSec(t, 0)).toBe(720)
    t = startTimer(t, 10_000)
    expect(remainingSec(t, 130_000)).toBe(600)
    t = pauseTimer(t, 130_000)
    expect(remainingSec(t, 500_000)).toBe(600)
    t = resumeTimer(t, 1_000_000)
    expect(remainingSec(t, 1_060_000)).toBe(540)
    expect(remainingSec(t, 9_999_999)).toBe(0)
  })
})
