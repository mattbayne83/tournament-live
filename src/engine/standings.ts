import type { Match, StandingRow, TeamId } from '../types/tournament'
import { rng } from './rng'

interface Rec {
  w: number
  l: number
  pf: number
  pa: number
}

/**
 * Forfeits count in the win/loss column but never in points — otherwise one
 * withdrawn team's string of 11-0s distorts every tiebreaker in the pool.
 */
function computeRecords(teamIds: TeamId[], matches: Match[]): Record<TeamId, Rec> {
  const recs: Record<TeamId, Rec> = Object.fromEntries(
    teamIds.map((id) => [id, { w: 0, l: 0, pf: 0, pa: 0 }]),
  )
  for (const m of matches) {
    if (!m.teamA || !m.teamB || !m.winner) continue
    if (m.status !== 'done' && m.status !== 'forfeit') continue
    if (!(m.teamA in recs) || !(m.teamB in recs)) continue
    const [winner, loser] = m.winner === 'a' ? [m.teamA, m.teamB] : [m.teamB, m.teamA]
    recs[winner].w += 1
    recs[loser].l += 1
    if (m.status === 'done' && m.score) {
      recs[m.teamA].pf += m.score.a
      recs[m.teamA].pa += m.score.b
      recs[m.teamB].pf += m.score.b
      recs[m.teamB].pa += m.score.a
    }
  }
  return recs
}

const winPct = (r: Rec) => (r.w + r.l === 0 ? 0 : r.w / (r.w + r.l))

/**
 * Tiebreaker chain: win% → head-to-head (clean 2-way ties only — cycles skip
 * it) → point diff among the tied teams → overall diff → points-for → seeded
 * coin flip, flagged with a visible note.
 */
export function computeStandings(teamIds: TeamId[], matches: Match[], seed: string): StandingRow[] {
  const recs = computeRecords(teamIds, matches)
  const rand = rng(seed)
  const notes = new Map<TeamId, string>()

  const scored = (matches: Match[]) => matches.filter((m) => m.status === 'done' && m.score)

  const headToHead = (a: TeamId, b: TeamId): number => {
    let net = 0
    for (const m of matches) {
      if (m.status !== 'done' && m.status !== 'forfeit') continue
      if (!m.winner) continue
      const pair = [m.teamA, m.teamB]
      if (!pair.includes(a) || !pair.includes(b)) continue
      const winner = m.winner === 'a' ? m.teamA : m.teamB
      net += winner === a ? 1 : -1
    }
    return net
  }

  const diffWithin = (id: TeamId, group: Set<TeamId>): number => {
    let diff = 0
    for (const m of scored(matches)) {
      if (!m.teamA || !m.teamB || !group.has(m.teamA) || !group.has(m.teamB)) continue
      if (m.teamA === id) diff += m.score!.a - m.score!.b
      else if (m.teamB === id) diff += m.score!.b - m.score!.a
    }
    return diff
  }

  /** Splits a tied group by a metric; recurses into sub-ties with the rest of the chain. */
  const splitBy = (group: TeamId[], metric: (id: TeamId) => number, rest: (g: TeamId[]) => TeamId[]): TeamId[] | null => {
    const values = new Map(group.map((id) => [id, metric(id)]))
    const distinct = new Set(values.values())
    if (distinct.size === 1) return null
    const tiers = [...distinct].sort((a, b) => b - a)
    return tiers.flatMap((v) => {
      const tier = group.filter((id) => values.get(id) === v)
      return tier.length > 1 ? rest(tier) : tier
    })
  }

  const resolve = (group: TeamId[]): TeamId[] => {
    if (group.length === 1) return group
    if (group.length === 2) {
      const h2h = headToHead(group[0], group[1])
      if (h2h !== 0) return h2h > 0 ? group : [group[1], group[0]]
    }
    const groupSet = new Set(group)
    return (
      splitBy(group, (id) => diffWithin(id, groupSet), resolve) ??
      splitBy(group, (id) => recs[id].pf - recs[id].pa, resolve) ??
      splitBy(group, (id) => recs[id].pf, resolve) ??
      coinFlip(group)
    )
  }

  const coinFlip = (group: TeamId[]): TeamId[] => {
    const ordered = [...group]
      .map((id) => ({ id, roll: rand() }))
      .sort((a, b) => b.roll - a.roll)
      .map((x) => x.id)
    for (const id of ordered) notes.set(id, 'tiebreak: coin flip')
    return ordered
  }

  const byPct = new Map<number, TeamId[]>()
  for (const id of teamIds) {
    const pct = winPct(recs[id])
    byPct.set(pct, [...(byPct.get(pct) ?? []), id])
  }
  const ordered = [...byPct.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, group]) => resolve(group))

  return ordered.map((teamId, i) => {
    const r = recs[teamId]
    return {
      teamId,
      rank: i + 1,
      ...r,
      diff: r.pf - r.pa,
      ...(notes.has(teamId) ? { note: notes.get(teamId) } : {}),
    }
  })
}
