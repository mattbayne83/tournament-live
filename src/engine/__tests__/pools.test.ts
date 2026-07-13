import { describe, expect, it } from 'vitest'
import type { Match, PoolConfig } from '../../types/tournament'
import { bracketPlacement, buildBracket, reportBracketResult } from '../bracket'
import { generatePools, poolSchedule, poolStandings, seedPlayoffFromPools } from '../pools'
import { rng } from '../rng'

const cfg: PoolConfig = { poolSize: 4, playoffTeamCount: 8, rngSeed: 'draw-1' }
const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`)

describe('generatePools', () => {
  it('splits 35 teams into 9 balanced pools', () => {
    const pools = generatePools(teams(35), cfg)
    expect(pools).toHaveLength(9)
    const sizes = pools.map((p) => p.teamIds.length)
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(35)
    expect(new Set(pools.flatMap((p) => p.teamIds)).size).toBe(35)
    expect(pools[0].name).toBe('Pool A')
  })

  it('is deterministic for a given seed and reshuffles for another', () => {
    const a = generatePools(teams(16), cfg)
    const b = generatePools(teams(16), cfg)
    expect(a).toEqual(b)
    const c = generatePools(teams(16), { ...cfg, rngSeed: 'draw-2' })
    expect(c.map((p) => p.teamIds)).not.toEqual(a.map((p) => p.teamIds))
  })
})

describe('poolSchedule', () => {
  it('gives a pool of 4 six games over 3 rounds, each pair once', () => {
    const [pool] = generatePools(teams(4), cfg)
    const games = poolSchedule(pool, 'd1')
    expect(games).toHaveLength(6)
    expect(new Set(games.map((m) => m.roundIndex))).toEqual(new Set([0, 1, 2]))
    const pairs = games.map((m) => [m.teamA, m.teamB].sort().join('-'))
    expect(new Set(pairs).size).toBe(6)
    for (let round = 0; round < 3; round++) {
      const inRound = games.filter((m) => m.roundIndex === round).flatMap((m) => [m.teamA, m.teamB])
      expect(new Set(inRound).size).toBe(inRound.length)
    }
  })

  it('rotates the bye in a pool of 5', () => {
    const pools = generatePools(teams(5), { ...cfg, poolSize: 5 })
    const games = poolSchedule(pools[0], 'd1')
    expect(games).toHaveLength(10)
    // 5 rounds, 2 games each; every team sits exactly once.
    for (let round = 0; round < 5; round++) {
      expect(games.filter((m) => m.roundIndex === round)).toHaveLength(2)
    }
    for (const t of pools[0].teamIds) {
      expect(games.filter((m) => m.teamA === t || m.teamB === t)).toHaveLength(4)
    }
  })
})

describe('full-event simulation: 35 teams, pools of 4 → top-8 playoff', () => {
  const skill = (id: string) => 40 - Number(id.slice(1))

  it('runs pool play and a playoff to a champion with coherent seeding', () => {
    const rand = rng('oct-7-rec')
    const allTeams = teams(35)
    const pools = generatePools(allTeams, cfg)
    const allGames: Match[] = pools.flatMap((p) => poolSchedule(p, 'rec'))

    // 8 pools of 4 (6 games) + 1 pool of 3 (3 games) = 51 games.
    expect(allGames).toHaveLength(51)

    const played = allGames.map((m) => {
      const pa = skill(m.teamA!) / (skill(m.teamA!) + skill(m.teamB!))
      const winner: 'a' | 'b' = rand() < pa ? 'a' : 'b'
      const losing = 3 + Math.floor(rand() * 7)
      return {
        ...m,
        score: winner === 'a' ? { a: 11, b: losing } : { a: losing, b: 11 },
        winner,
        status: 'done' as const,
      }
    })

    // Every team plays its pool-mates exactly once.
    for (const pool of pools) {
      for (const t of pool.teamIds) {
        const count = played.filter((m) => m.poolId === pool.id && (m.teamA === t || m.teamB === t)).length
        expect(count).toBe(pool.teamIds.length - 1)
      }
    }

    const perPool = pools.map((p) => poolStandings(p, played, cfg.rngSeed))
    for (const rows of perPool) {
      expect(rows.map((r) => r.rank)).toEqual(rows.map((_, i) => i + 1))
    }

    const seeds = seedPlayoffFromPools(perPool, cfg.playoffTeamCount)
    expect(seeds).toHaveLength(8)
    expect(new Set(seeds).size).toBe(8)
    // The top tier is exactly the nine pool winners' best eight — all rank-1 teams.
    const poolWinners = new Set(perPool.map((rows) => rows[0].teamId))
    expect(seeds.filter((s) => poolWinners.has(s)).length).toBe(8)

    // Play the bracket to completion, favorites winning.
    const built = buildBracket(seeds, 'rec', { thirdPlaceMatch: false })
    const matches = Object.fromEntries(built.matches.map((m) => [m.id, m]))
    let state = built.state
    for (let round = 1; round <= 3; round++) {
      for (const m of Object.values(matches).filter((m) => m.roundIndex === round)) {
        const winner: 'a' | 'b' = skill(m.teamA!) >= skill(m.teamB!) ? 'a' : 'b'
        matches[m.id] = { ...m, score: winner === 'a' ? { a: 11, b: 6 } : { a: 6, b: 11 }, winner, status: 'done' }
        const result = reportBracketResult(state, matches, m.id)
        state = result.state
        for (const u of result.updatedMatches) matches[u.id] = u
      }
    }
    expect(state.championId).not.toBeNull()
    const placement = bracketPlacement(state, matches, seeds)
    expect(placement).toHaveLength(4)
    expect(placement[0]).toBe(state.championId)
  })
})
