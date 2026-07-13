import type {
  CourtId,
  DivisionId,
  LadderConfig,
  LadderRoundRecord,
  LadderState,
  Match,
  MatchResult,
  RoundTimer,
  StandingRow,
  TeamId,
} from '../types/tournament'
import { ladderMatchId } from './ids'

export function seedLadder(teamIds: TeamId[], cfg: LadderConfig): LadderState {
  return {
    order: [...teamIds],
    roundIndex: 0,
    roundPhase: 'idle',
    currentMatchIds: [],
    currentSitters: [],
    byeCounts: Object.fromEntries(teamIds.map((id) => [id, 0])),
    lastByeRound: Object.fromEntries(teamIds.map((id) => [id, -1])),
    stats: Object.fromEntries(teamIds.map((id) => [id, { w: 0, l: 0, pf: 0, pa: 0 }])),
    timer: { startedAt: null, durationSec: cfg.roundMinutes * 60, pausedRemainingSec: null },
    history: [],
    playoff: null,
  }
}

/**
 * Sitters are the teams most "owed" a bye: fewest byes so far, then the one
 * whose last bye is oldest, then lowest ladder rank. The current top-court
 * pair is exempt unless there aren't enough other teams to sit.
 */
function chooseSitters(s: LadderState, sitCount: number, cfg: LadderConfig): TeamId[] {
  if (sitCount <= 0) return []
  const rank = new Map(s.order.map((id, i) => [id, i]))
  let eligible = s.order
  if (cfg.exemptTopCourtFromByes && s.order.length - 2 >= sitCount) {
    eligible = s.order.slice(2)
  }
  return [...eligible]
    .sort((x, y) => {
      const byBye = s.byeCounts[x] - s.byeCounts[y]
      if (byBye !== 0) return byBye
      const byLast = s.lastByeRound[x] - s.lastByeRound[y]
      if (byLast !== 0) return byLast
      return rank.get(y)! - rank.get(x)!
    })
    .slice(0, sitCount)
}

export function pairNextRound(
  s: LadderState,
  divisionId: DivisionId,
  courtIds: CourtId[],
  cfg: LadderConfig,
): { state: LadderState; newMatches: Match[] } {
  if (s.roundPhase !== 'idle') throw new Error('round already in progress')
  const courts = [...courtIds].sort((a, b) => a - b)
  const capacity = 2 * courts.length
  let playingCount = Math.min(capacity, s.order.length)
  if (playingCount % 2 === 1) playingCount -= 1
  if (playingCount < 2) throw new Error('not enough teams to pair a round')

  const sitters = chooseSitters(s, s.order.length - playingCount, cfg)
  const sitterSet = new Set(sitters)
  const playing = s.order.filter((id) => !sitterSet.has(id))

  const newMatches: Match[] = []
  for (let i = 0; i * 2 < playing.length; i++) {
    newMatches.push({
      id: ladderMatchId(divisionId, s.roundIndex, courts[i]),
      divisionId,
      phase: 'ladder',
      roundIndex: s.roundIndex,
      courtId: courts[i],
      teamA: playing[2 * i],
      teamB: playing[2 * i + 1],
      score: null,
      winner: null,
      status: 'playing',
    })
  }

  return {
    state: {
      ...s,
      roundPhase: 'playing',
      currentMatchIds: newMatches.map((m) => m.id),
      currentSitters: sitters,
    },
    newMatches,
  }
}

/**
 * Up/down movement over one round's results (ordered top court first):
 * top-court winner stays up, bottom-court loser stays down, every other
 * winner climbs one court and every other loser drops one.
 */
function movedSequence(results: MatchResult[]): TeamId[] {
  const winner = (r: MatchResult) => (r.winner === 'a' ? r.a : r.b)
  const loser = (r: MatchResult) => (r.winner === 'a' ? r.b : r.a)
  const k = results.length
  const seq: TeamId[] = []
  for (let i = 0; i < k; i++) {
    seq.push(i === 0 ? winner(results[0]) : loser(results[i - 1]))
    seq.push(i === k - 1 ? loser(results[k - 1]) : winner(results[i + 1]))
  }
  return seq
}

/**
 * Applies movement to `order`: the teams that played vacate their positions,
 * and the moved sequence fills those same positions top-down. Sitters keep
 * their frozen ranks.
 */
function applyMovement(order: TeamId[], results: MatchResult[]): TeamId[] {
  const played = new Set(results.flatMap((r) => [r.a, r.b]))
  const positions = order.map((id, i) => (played.has(id) ? i : -1)).filter((i) => i >= 0)
  if (positions.length !== played.size) throw new Error('result teams not on ladder')
  const seq = movedSequence(results)
  const next = [...order]
  positions.forEach((pos, i) => {
    next[pos] = seq[i]
  })
  return next
}

function sortByCourt(results: MatchResult[]): MatchResult[] {
  return [...results].sort((a, b) => a.courtId - b.courtId)
}

export function applyRoundResults(s: LadderState, results: MatchResult[]): LadderState {
  if (results.length !== s.currentMatchIds.length) {
    throw new Error(`expected ${s.currentMatchIds.length} results, got ${results.length}`)
  }
  const ordered = sortByCourt(results)
  const record: LadderRoundRecord = {
    roundIndex: s.roundIndex,
    orderBefore: s.order,
    sitters: s.currentSitters,
    results: ordered,
  }

  const stats = structuredClone(s.stats)
  for (const r of ordered) {
    stats[r.a].pf += r.score.a
    stats[r.a].pa += r.score.b
    stats[r.b].pf += r.score.b
    stats[r.b].pa += r.score.a
    stats[r.winner === 'a' ? r.a : r.b].w += 1
    stats[r.winner === 'a' ? r.b : r.a].l += 1
  }

  const byeCounts = { ...s.byeCounts }
  const lastByeRound = { ...s.lastByeRound }
  for (const id of s.currentSitters) {
    byeCounts[id] += 1
    lastByeRound[id] = s.roundIndex
  }

  return {
    ...s,
    order: applyMovement(s.order, ordered),
    roundIndex: s.roundIndex + 1,
    roundPhase: 'idle',
    currentMatchIds: [],
    currentSitters: [],
    byeCounts,
    lastByeRound,
    stats,
    timer: { ...s.timer, startedAt: null, pausedRemainingSec: null },
    history: [...s.history, record],
  }
}

/**
 * Removes the current top N teams into a mini-playoff. The remaining ladder
 * compacts upward; the caller should also stop scheduling ladder rounds onto
 * the championship court.
 */
export function extractPlayoff(s: LadderState, championshipCourt: CourtId, cfg: LadderConfig): LadderState {
  if (s.roundPhase !== 'idle') throw new Error('finish the current round before extracting a playoff')
  if (s.playoff) throw new Error('playoff already extracted')
  const n = cfg.playoffTopN
  if (s.order.length < n + 2) throw new Error(`need at least ${n + 2} teams to extract a top-${n} playoff`)
  const extracted = s.order.slice(0, n)
  return {
    ...s,
    order: s.order.slice(n),
    playoff: {
      bracket: null,
      extractedIds: extracted,
      preExtractionSeeds: extracted,
      championshipCourt,
    },
  }
}

/** Removes a withdrawn team between rounds; stats are kept for the record. */
export function removeTeam(s: LadderState, teamId: TeamId): LadderState {
  if (s.roundPhase !== 'idle') throw new Error('cannot remove a team mid-round')
  return { ...s, order: s.order.filter((id) => id !== teamId) }
}

/**
 * Rebuilds ladder state by re-folding recorded rounds (with possibly corrected
 * winners/scores) from the original seed order. Each round's matchups and
 * sitters are kept as physically played; only movement and stats recompute.
 * Folding unmodified records reproduces the live state exactly.
 */
export function replayLadder(
  seedTeamIds: TeamId[],
  cfg: LadderConfig,
  records: LadderRoundRecord[],
): LadderState {
  let s = seedLadder(seedTeamIds, cfg)
  for (const record of records) {
    s = {
      ...s,
      roundPhase: 'playing',
      currentMatchIds: record.results.map((r) => r.matchId),
      currentSitters: record.sitters,
    }
    s = applyRoundResults(s, record.results)
  }
  return s
}

/**
 * Standings: playoff teams own the top places (in bracket-final placement
 * order once known, pre-extraction seed order until then), then the live
 * ladder in rank order.
 */
export function ladderStandings(s: LadderState, playoffPlacement?: TeamId[]): StandingRow[] {
  const top = s.playoff ? (playoffPlacement ?? s.playoff.preExtractionSeeds) : []
  return [...top, ...s.order].map((teamId, i) => {
    const st = s.stats[teamId]
    return { teamId, rank: i + 1, ...st, diff: st.pf - st.pa }
  })
}

// --- Round timer (pure; caller injects `now` in epoch ms) ---

export function startTimer(t: RoundTimer, now: number): RoundTimer {
  return { ...t, startedAt: now, pausedRemainingSec: null }
}

export function pauseTimer(t: RoundTimer, now: number): RoundTimer {
  return { ...t, startedAt: null, pausedRemainingSec: remainingSec(t, now) }
}

export function resumeTimer(t: RoundTimer, now: number): RoundTimer {
  const remaining = t.pausedRemainingSec ?? t.durationSec
  return {
    ...t,
    startedAt: now - (t.durationSec - remaining) * 1000,
    pausedRemainingSec: null,
  }
}

export function remainingSec(t: RoundTimer, now: number): number {
  if (t.pausedRemainingSec !== null) return t.pausedRemainingSec
  if (t.startedAt === null) return t.durationSec
  return Math.max(0, t.durationSec - (now - t.startedAt) / 1000)
}
