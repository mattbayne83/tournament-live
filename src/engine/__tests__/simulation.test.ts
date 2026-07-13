import { describe, expect, it } from 'vitest'
import type { LadderConfig, LadderState, Match, MatchResult } from '../../types/tournament'
import { applyRoundResults, extractPlayoff, ladderStandings, pairNextRound, replayLadder, seedLadder } from '../ladder'
import { rng } from '../rng'

/**
 * Full fake event at the brutal real-world ratio: 15 teams on 4 courts means
 * 7 of 15 sit every round. Invariants are asserted after every single round.
 */
const cfg: LadderConfig = {
  roundMinutes: 12,
  tieRule: 'suddenDeathPoint',
  exemptTopCourtFromByes: true,
  playoffTopN: 4,
}

const TEAMS = Array.from({ length: 15 }, (_, i) => `T${i + 1}`)
/** Lower team number = stronger team, so the ladder should sort itself. */
const skill = (id: string) => 20 - Number(id.slice(1))

function simulateResults(matches: Match[], rand: () => number): MatchResult[] {
  return matches.map((m) => {
    const pa = skill(m.teamA!) / (skill(m.teamA!) + skill(m.teamB!))
    const winner = rand() < pa ? 'a' : 'b'
    const losing = 4 + Math.floor(rand() * 6) // 4..9
    return {
      matchId: m.id,
      courtId: m.courtId!,
      a: m.teamA!,
      b: m.teamB!,
      score: winner === 'a' ? { a: 11, b: losing } : { a: losing, b: 11 },
      winner,
    }
  })
}

function assertRoundInvariants(before: LadderState, matches: Match[], sitters: string[], active: string[]) {
  const playing = matches.flatMap((m) => [m.teamA!, m.teamB!])
  // Partition: every active team either plays exactly once or sits.
  expect(new Set(playing).size).toBe(playing.length)
  expect([...playing, ...sitters].sort()).toEqual([...active].sort())
  // Order stays a permutation of active teams.
  expect([...before.order].sort()).toEqual([...active].sort())
  // Courts are distinct.
  const courts = matches.map((m) => m.courtId)
  expect(new Set(courts).size).toBe(courts.length)
}

function assertLedgerInvariants(s: LadderState, roundsPlayed: number) {
  const totals = Object.values(s.stats).reduce(
    (acc, t) => ({ w: acc.w + t.w, l: acc.l + t.l, pf: acc.pf + t.pf, pa: acc.pa + t.pa }),
    { w: 0, l: 0, pf: 0, pa: 0 },
  )
  expect(totals.w).toBe(totals.l)
  expect(totals.pf).toBe(totals.pa)
  // Games played + byes = rounds elapsed, for every team still on a full run.
  for (const id of Object.keys(s.stats)) {
    expect(s.stats[id].w + s.stats[id].l + s.byeCounts[id]).toBe(roundsPlayed)
  }
}

/**
 * Bye fairness is per-round dominance: nobody sits while an eligible
 * (non-top-court) team with fewer byes plays. A global spread bound would be
 * wrong — a team dwelling on the exempt top court fairly accumulates zero byes.
 */
function assertByeFairness(before: LadderState, sitters: string[], active: string[]) {
  if (sitters.length === 0) return
  const exempt = new Set(before.order.slice(0, 2))
  const sitterSet = new Set(sitters)
  const eligiblePlaying = active.filter((id) => !sitterSet.has(id) && !exempt.has(id))
  if (eligiblePlaying.length === 0) return
  const maxSitter = Math.max(...sitters.map((id) => before.byeCounts[id]))
  const minPlaying = Math.min(...eligiblePlaying.map((id) => before.byeCounts[id]))
  expect(maxSitter).toBeLessThanOrEqual(minPlaying)
}

describe('full-event simulation: 15 teams, 4 courts, extraction, finale', () => {
  it('survives 6 ladder rounds, playoff extraction, and 2 more rounds', () => {
    const rand = rng('oneok-oct-7')
    const courts = [1, 2, 3, 4]
    let s = seedLadder(TEAMS, cfg)

    for (let round = 0; round < 6; round++) {
      const { state, newMatches } = pairNextRound(s, 'comp', courts, cfg)
      expect(newMatches).toHaveLength(4)
      expect(state.currentSitters).toHaveLength(7)
      assertRoundInvariants(state, newMatches, state.currentSitters, TEAMS)
      assertByeFairness(s, state.currentSitters, TEAMS)
      s = applyRoundResults(state, simulateResults(newMatches, rand))
      assertLedgerInvariants(s, round + 1)
    }

    // Self-seeding: strong teams should have drifted toward the top.
    const topSix = s.order.slice(0, 6).map((id) => Number(id.slice(1)))
    expect(topSix.filter((n) => n <= 8).length).toBeGreaterThanOrEqual(4)

    // Extract top 4 onto championship court 1; ladder continues on 2-4.
    const extracted = s.order.slice(0, 4)
    s = extractPlayoff(s, 1, cfg)
    expect(s.order).toHaveLength(11)
    expect(s.playoff?.extractedIds).toEqual(extracted)

    const remainingCourts = [2, 3, 4]
    for (let round = 6; round < 8; round++) {
      const { state, newMatches } = pairNextRound(s, 'comp', remainingCourts, cfg)
      // 11 active, capacity 6 → 6 play, 5 sit; extracted teams never reappear.
      expect(newMatches).toHaveLength(3)
      expect(state.currentSitters).toHaveLength(5)
      assertRoundInvariants(state, newMatches, state.currentSitters, s.order)
      assertByeFairness(s, state.currentSitters, s.order)
      for (const m of newMatches) {
        expect(extracted).not.toContain(m.teamA)
        expect(extracted).not.toContain(m.teamB)
      }
      s = applyRoundResults(state, simulateResults(newMatches, rand))
    }

    // Standings: playoff teams hold ranks 1-4, everyone accounted for once.
    const rows = ladderStandings(s)
    expect(rows).toHaveLength(15)
    expect(rows.slice(0, 4).map((r) => r.teamId)).toEqual(extracted)
    expect(new Set(rows.map((r) => r.teamId)).size).toBe(15)

    // The whole event replays from history byte-for-byte.
    const replayed = replayLadder(TEAMS, cfg, s.history)
    // (extraction isn't a round record — replay covers pre-extraction rounds)
    expect(replayed.history).toHaveLength(8)
    expect(replayed.stats).toEqual(s.stats)
  })
})
