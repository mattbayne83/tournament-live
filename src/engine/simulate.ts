import { buildBracket } from './bracket'
import { applyRoundResults, extractPlayoff, pairNextRound, seedLadder } from './ladder'
import { generatePools, poolSchedule } from './pools'
import { rng } from './rng'
import type { LadderConfig, Match, MatchResult, TeamId } from '../types/tournament'

/**
 * Day-planning simulator: runs the real engines over a hypothetical field to
 * answer "does this fit the block?" and "how much does everyone play?".
 */
export interface SimConfig {
  format: 'ladder' | 'pools'
  teams: number
  courts: number
  /** Target block length; ladder fits rounds into it, pools is compared against it. */
  blockMinutes: number
  /** Untimed game length including switchover (pool play, playoffs). */
  avgGameMinutes: number
  // ladder
  roundMinutes: number
  /** Whistle-to-first-serve between ladder rounds. */
  transitionMinutes: number
  /** Hybrid finish: top-4 semis + final on a championship court near block end. */
  ladderPlayoff: boolean
  // pools
  poolSize: 3 | 4 | 5
  playoffTeamCount: number
}

export interface SimSegment {
  label: string
  startMin: number
  minutes: number
  kind: 'round' | 'wave' | 'playoff'
}

export interface SimResult {
  totalMinutes: number
  segments: SimSegment[]
  totalGames: number
  gamesPerTeam: { min: number; avg: number; max: number }
  /** Ladder only: how many sit each round, and the worst back-to-back stretch. */
  sitting: { perRound: number; maxConsecutive: number } | null
  notes: string[]
}

export const defaultSimConfig: SimConfig = {
  format: 'ladder',
  teams: 16,
  courts: 8,
  blockMinutes: 120,
  avgGameMinutes: 13,
  roundMinutes: 12,
  transitionMinutes: 2,
  ladderPlayoff: true,
  poolSize: 4,
  playoffTeamCount: 8,
}

export function simulate(cfg: SimConfig): SimResult {
  return cfg.format === 'ladder' ? simulateLadder(cfg) : simulatePools(cfg)
}

const teamIds = (n: number): TeamId[] => Array.from({ length: n }, (_, i) => `S${i + 1}`)

function randomResults(matches: Match[], rand: () => number): MatchResult[] {
  return matches.map((m) => {
    const winner: 'a' | 'b' = rand() < 0.5 ? 'a' : 'b'
    const losing = 3 + Math.floor(rand() * 8)
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

function gamesStats(games: Map<TeamId, number>): SimResult['gamesPerTeam'] {
  const counts = [...games.values()]
  const total = counts.reduce((a, b) => a + b, 0)
  return {
    min: Math.min(...counts),
    avg: Math.round((total / counts.length) * 10) / 10,
    max: Math.max(...counts),
  }
}

function simulateLadder(cfg: SimConfig): SimResult {
  const notes: string[] = []
  const ids = teamIds(cfg.teams)
  const ladderCfg: LadderConfig = {
    roundMinutes: cfg.roundMinutes,
    tieRule: 'suddenDeathPoint',
    exemptTopCourtFromByes: true,
    playoffTopN: 4,
  }
  const rand = rng(`sim-${cfg.teams}-${cfg.courts}`)
  const roundLen = cfg.roundMinutes + cfg.transitionMinutes
  const rounds = Math.max(1, Math.floor(cfg.blockMinutes / roundLen))
  const playoffMinutes = 3 * cfg.avgGameMinutes // two semis then a final, one court
  const wantPlayoff = cfg.ladderPlayoff && cfg.teams >= 6 && cfg.courts >= 2
  if (cfg.ladderPlayoff && !wantPlayoff) notes.push('playoff skipped — needs at least 6 teams and 2 courts')
  const extractionRound = wantPlayoff
    ? Math.max(1, Math.min(rounds, Math.floor((cfg.blockMinutes - playoffMinutes) / roundLen)))
    : Infinity

  const allCourts = Array.from({ length: cfg.courts }, (_, i) => i + 1)
  let courts = allCourts
  let s = seedLadder(ids, ladderCfg)
  const games = new Map<TeamId, number>(ids.map((id) => [id, 0]))
  const consecutiveSits = new Map<TeamId, number>(ids.map((id) => [id, 0]))
  let maxConsecutive = 0
  const segments: SimSegment[] = []
  let clock = 0
  let sittersPerRound = 0

  for (let r = 0; r < rounds; r++) {
    if (r === extractionRound) {
      const extracted = s.order.slice(0, 4)
      s = extractPlayoff(s, courts[0], ladderCfg)
      courts = courts.slice(1)
      segments.push({ label: 'Championship playoff', startMin: clock, minutes: playoffMinutes, kind: 'playoff' })
      // Semis + final: champion and runner-up play 2, semifinal losers play 1.
      extracted.forEach((id, i) => games.set(id, games.get(id)! + (i < 2 ? 2 : 1)))
      notes.push(`top 4 extracted after round ${r} — court ${allCourts[0]} becomes the championship court`)
    }
    if (s.order.length < 2 || courts.length === 0) break
    const { state, newMatches } = pairNextRound(s, 'sim', courts, ladderCfg)
    sittersPerRound = state.currentSitters.length
    for (const m of newMatches) {
      games.set(m.teamA!, games.get(m.teamA!)! + 1)
      games.set(m.teamB!, games.get(m.teamB!)! + 1)
    }
    const sitterSet = new Set(state.currentSitters)
    for (const id of s.order) {
      const run = sitterSet.has(id) ? consecutiveSits.get(id)! + 1 : 0
      consecutiveSits.set(id, run)
      maxConsecutive = Math.max(maxConsecutive, run)
    }
    s = applyRoundResults(state, randomResults(newMatches, rand))
    segments.push({ label: `Round ${r + 1}`, startMin: clock, minutes: roundLen, kind: 'round' })
    clock += roundLen
  }

  const playoffEnd = wantPlayoff ? extractionRound * roundLen + playoffMinutes : 0
  const totalGames = [...games.values()].reduce((a, b) => a + b, 0) / 2
  return {
    totalMinutes: Math.max(clock, playoffEnd),
    segments,
    totalGames,
    gamesPerTeam: gamesStats(games),
    sitting: { perRound: sittersPerRound, maxConsecutive },
    notes,
  }
}

function simulatePools(cfg: SimConfig): SimResult {
  const notes: string[] = []
  const ids = teamIds(cfg.teams)
  const rand = rng(`sim-${cfg.teams}-${cfg.courts}`)
  const pools = generatePools(ids, { poolSize: cfg.poolSize, playoffTeamCount: cfg.playoffTeamCount, rngSeed: 'sim' })
  const schedule = pools.flatMap((p) => poolSchedule(p, 'sim'))
  const games = new Map<TeamId, number>(ids.map((id) => [id, 0]))
  for (const m of schedule) {
    games.set(m.teamA!, games.get(m.teamA!)! + 1)
    games.set(m.teamB!, games.get(m.teamB!)! + 1)
  }

  // Wave the queue onto courts: earlier schedule rounds first, no team twice per wave.
  const segments: SimSegment[] = []
  let clock = 0
  const queue = [...schedule].sort((a, b) => a.roundIndex - b.roundIndex)
  let wave = 0
  while (queue.length > 0) {
    const busy = new Set<TeamId>()
    let used = 0
    for (let i = 0; i < queue.length && used < cfg.courts; ) {
      const m = queue[i]
      if (busy.has(m.teamA!) || busy.has(m.teamB!)) {
        i++
        continue
      }
      busy.add(m.teamA!)
      busy.add(m.teamB!)
      queue.splice(i, 1)
      used++
    }
    segments.push({ label: `Wave ${++wave}`, startMin: clock, minutes: cfg.avgGameMinutes, kind: 'wave' })
    clock += cfg.avgGameMinutes
  }

  // Playoff: bracket rounds run sequentially, each round waved onto the courts.
  const n = Math.min(cfg.playoffTeamCount, cfg.teams)
  if (n >= 2) {
    const { state, matches } = buildBracket(ids.slice(0, n), 'sim', { thirdPlaceMatch: false })
    const rounds = Math.log2(state.size)
    // Simulate winners so per-team playoff game counts are realistic.
    const alive = new Map<string, TeamId>()
    for (let round = 1; round <= rounds; round++) {
      const inRound = matches.filter((m) => m.roundIndex === round)
      const playable = inRound.length
      if (playable === 0) continue
      const waves = Math.ceil(playable / cfg.courts)
      segments.push({
        label: rounds - round === 0 ? 'Final' : rounds - round === 1 ? 'Semifinals' : `Playoff R${round}`,
        startMin: clock,
        minutes: waves * cfg.avgGameMinutes,
        kind: 'playoff',
      })
      clock += waves * cfg.avgGameMinutes
      for (const m of inRound) {
        const slot = state.slots.find((sl) => sl.matchId === m.id)!
        const a = m.teamA ?? (slot.a.type === 'winnerOf' ? alive.get(slot.a.slotId) : undefined)
        const b = m.teamB ?? (slot.b.type === 'winnerOf' ? alive.get(slot.b.slotId) : undefined)
        if (!a || !b) continue
        games.set(a, games.get(a)! + 1)
        games.set(b, games.get(b)! + 1)
        alive.set(slot.id, rand() < 0.5 ? a : b)
      }
    }
    notes.push(`playoff: top ${n} into a ${state.size}-bracket`)
  }

  if (clock > cfg.blockMinutes) {
    notes.push(`runs ${Math.round(clock - cfg.blockMinutes)} min over the ${cfg.blockMinutes}-min block`)
  }
  const totalGames = [...games.values()].reduce((a, b) => a + b, 0) / 2
  return {
    totalMinutes: clock,
    segments,
    totalGames,
    gamesPerTeam: gamesStats(games),
    sitting: null,
    notes,
  }
}
