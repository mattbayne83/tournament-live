import type { DivisionId, Match, Pool, PoolConfig, StandingRow, TeamId } from '../types/tournament'
import { poolMatchId } from './ids'
import { rng, shuffled } from './rng'
import { computeStandings } from './standings'

const POOL_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Seeded shuffle, then snake-distribute into the fewest pools that keep every
 * pool within one team of the configured size.
 */
export function generatePools(teamIds: TeamId[], cfg: PoolConfig): Pool[] {
  if (teamIds.length < 3) throw new Error('need at least 3 teams for pool play')
  const poolCount = Math.ceil(teamIds.length / cfg.poolSize)
  const drawn = shuffled(teamIds, rng(cfg.rngSeed))
  const buckets: TeamId[][] = Array.from({ length: poolCount }, () => [])
  drawn.forEach((id, i) => {
    const row = Math.floor(i / poolCount)
    const col = i % poolCount
    buckets[row % 2 === 0 ? col : poolCount - 1 - col].push(id)
  })
  return buckets.map((teamIds, i) => ({
    id: `P${POOL_NAMES[i]}`,
    name: `Pool ${POOL_NAMES[i]}`,
    teamIds,
    matchIds: [],
  }))
}

/**
 * Circle-method round robin: every pair plays exactly once, and each team's
 * games are spread across rounds (a team never plays twice in one round).
 */
export function poolSchedule(pool: Pool, divisionId: DivisionId): Match[] {
  const ids: (TeamId | null)[] = [...pool.teamIds]
  if (ids.length % 2 === 1) ids.push(null) // rotating bye
  const n = ids.length
  const matches: Match[] = []
  let seq = 0
  for (let round = 0; round < n - 1; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i]
      const b = ids[n - 1 - i]
      if (a === null || b === null) continue
      matches.push({
        id: poolMatchId(divisionId, pool.id, seq++),
        divisionId,
        phase: 'pool',
        roundIndex: round,
        poolId: pool.id,
        courtId: null,
        teamA: a,
        teamB: b,
        score: null,
        winner: null,
        status: 'queued',
      })
    }
    // Rotate all but the first position.
    ids.splice(1, 0, ids.pop()!)
  }
  return matches
}

export function poolStandings(pool: Pool, matches: Match[], seed: string): StandingRow[] {
  const poolMatches = matches.filter((m) => m.poolId === pool.id)
  return computeStandings(pool.teamIds, poolMatches, `${seed}:${pool.id}`)
}

/**
 * Seeds a playoff from finished pools: all pool winners first (strongest
 * record leading), then runners-up, and so on until `n` teams are taken.
 */
export function seedPlayoffFromPools(perPool: StandingRow[][], n: number): TeamId[] {
  const maxRank = Math.max(...perPool.map((rows) => rows.length))
  const seeds: TeamId[] = []
  for (let rank = 0; rank < maxRank && seeds.length < n; rank++) {
    const tier = perPool
      .map((rows) => rows[rank])
      .filter((row): row is StandingRow => row !== undefined)
      .sort((a, b) => {
        const pctA = a.w + a.l === 0 ? 0 : a.w / (a.w + a.l)
        const pctB = b.w + b.l === 0 ? 0 : b.w / (b.w + b.l)
        if (pctB !== pctA) return pctB - pctA
        if (b.diff !== a.diff) return b.diff - a.diff
        return b.pf - a.pf
      })
    for (const row of tier) {
      if (seeds.length < n) seeds.push(row.teamId)
    }
  }
  return seeds
}
