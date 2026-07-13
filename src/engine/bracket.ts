import type {
  BracketConfig,
  BracketSlot,
  BracketState,
  DivisionId,
  Match,
  SlotSource,
  TeamId,
} from '../types/tournament'
import { bracketMatchId } from './ids'

/**
 * Classic bracket seed layout: 1 meets 2 only in the final, 1v4 / 2v3 in
 * semis, and so on. Returns first-round seed numbers top to bottom.
 */
function seedPositions(size: number): number[] {
  let positions = [1]
  while (positions.length < size) {
    const n = positions.length * 2
    positions = positions.flatMap((s) => [s, n + 1 - s])
  }
  return positions
}

function bracketSize(teamCount: number): BracketState['size'] {
  for (const size of [2, 4, 8, 16, 32, 64] as const) {
    if (teamCount <= size) return size
  }
  throw new Error('bracket supports at most 64 teams')
}

/**
 * Builds a single-elimination bracket. Seeds beyond the field are byes and
 * auto-advance at build time (byes only ever occur in round 1, because the
 * field is always more than half the bracket size).
 */
export function buildBracket(
  seedOrder: TeamId[],
  divisionId: DivisionId,
  cfg: BracketConfig,
): { state: BracketState; matches: Match[] } {
  if (seedOrder.length < 2) throw new Error('need at least 2 teams')
  const size = bracketSize(seedOrder.length)
  const rounds = Math.log2(size)
  const teamAtSeed = (seed: number): TeamId | null => seedOrder[seed - 1] ?? null

  const slots: BracketSlot[] = []
  const matches: Match[] = []
  /** Teams already known for a slot side (from seeds or round-1 byes). */
  const advanced = new Map<string, TeamId>()

  const positions = seedPositions(size)
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round
    for (let index = 0; index < count; index++) {
      const id = `R${round}-${index}`
      let a: SlotSource
      let b: SlotSource
      let teamA: TeamId | null = null
      let teamB: TeamId | null = null
      if (round === 1) {
        const seedA = positions[2 * index]
        const seedB = positions[2 * index + 1]
        teamA = teamAtSeed(seedA)
        teamB = teamAtSeed(seedB)
        a = teamA ? { type: 'seed', seed: seedA } : { type: 'bye' }
        b = teamB ? { type: 'seed', seed: seedB } : { type: 'bye' }
        if (teamA && !teamB) advanced.set(id, teamA)
        if (teamB && !teamA) advanced.set(id, teamB)
      } else {
        const feedA = `R${round - 1}-${2 * index}`
        const feedB = `R${round - 1}-${2 * index + 1}`
        a = { type: 'winnerOf', slotId: feedA }
        b = { type: 'winnerOf', slotId: feedB }
        teamA = advanced.get(feedA) ?? null
        teamB = advanced.get(feedB) ?? null
      }
      const isByeSlot = round === 1 && advanced.has(id)
      const matchId = isByeSlot ? null : bracketMatchId(divisionId, id)
      slots.push({ id, round, index, matchId, a, b })
      if (matchId) {
        matches.push({
          id: matchId,
          divisionId,
          phase: 'bracket',
          roundIndex: round,
          bracketSlotId: id,
          courtId: null,
          teamA,
          teamB,
          score: null,
          winner: null,
          status: 'queued',
        })
      }
    }
  }

  if (cfg.thirdPlaceMatch && size >= 4) {
    const sfA = `R${rounds - 1}-0`
    const sfB = `R${rounds - 1}-1`
    const matchId = bracketMatchId(divisionId, '3P')
    slots.push({
      id: '3P',
      round: rounds,
      index: 1,
      matchId,
      a: { type: 'loserOf', slotId: sfA },
      b: { type: 'loserOf', slotId: sfB },
    })
    matches.push({
      id: matchId,
      divisionId,
      phase: 'bracket',
      roundIndex: rounds,
      bracketSlotId: '3P',
      courtId: null,
      teamA: null,
      teamB: null,
      score: null,
      winner: null,
      status: 'queued',
    })
  }

  return { state: { size, seedOrder: [...seedOrder], slots, championId: null }, matches }
}

function slotWinner(slot: BracketSlot, matches: Record<string, Match>, seedOrder: TeamId[]): TeamId | null {
  if (!slot.matchId) {
    // Round-1 bye slot: the lone seeded team advanced at build time.
    const seeded = [slot.a, slot.b].find((s) => s.type === 'seed')
    return seeded?.type === 'seed' ? (seedOrder[seeded.seed - 1] ?? null) : null
  }
  const m = matches[slot.matchId]
  if (!m?.winner) return null
  return m.winner === 'a' ? m.teamA : m.teamB
}

function slotLoser(slot: BracketSlot, matches: Record<string, Match>): TeamId | null {
  if (!slot.matchId) return null
  const m = matches[slot.matchId]
  if (!m?.winner) return null
  return m.winner === 'a' ? m.teamB : m.teamA
}

/**
 * Propagates a completed match's winner (and loser, for a 3rd-place game)
 * into the slots it feeds. Returns the updated bracket plus the fed matches.
 */
export function reportBracketResult(
  state: BracketState,
  matches: Record<string, Match>,
  matchId: string,
): { state: BracketState; updatedMatches: Match[] } {
  const slot = state.slots.find((s) => s.matchId === matchId)
  if (!slot) throw new Error(`no bracket slot for match ${matchId}`)
  const winner = slotWinner(slot, matches, state.seedOrder)
  if (!winner) throw new Error(`match ${matchId} has no winner recorded`)

  const updatedMatches: Match[] = []
  for (const target of state.slots) {
    if (!target.matchId) continue
    const m = matches[target.matchId]
    const fill = (source: SlotSource) => {
      if (source.type === 'winnerOf' && source.slotId === slot.id) return winner
      if (source.type === 'loserOf' && source.slotId === slot.id) return slotLoser(slot, matches)
      return null
    }
    const teamA = fill(target.a)
    const teamB = fill(target.b)
    if (teamA || teamB) {
      updatedMatches.push({
        ...m,
        teamA: teamA ?? m.teamA,
        teamB: teamB ?? m.teamB,
      })
    }
  }

  const rounds = Math.log2(state.size)
  const isFinal = slot.id === `R${rounds}-0`
  return {
    state: isFinal ? { ...state, championId: winner } : state,
    updatedMatches,
  }
}

/**
 * Final placement: champion, runner-up, then 3rd/4th — from the 3rd-place
 * game when played, otherwise semifinal losers ordered by `fallbackOrder`
 * (e.g. pre-extraction ladder seeds).
 */
export function bracketPlacement(
  state: BracketState,
  matches: Record<string, Match>,
  fallbackOrder: TeamId[],
): TeamId[] {
  const rounds = Math.log2(state.size)
  const bySlotId = new Map(state.slots.map((s) => [s.id, s]))
  const final = bySlotId.get(`R${rounds}-0`)
  if (!final) return []
  const champion = slotWinner(final, matches, state.seedOrder)
  if (!champion) return []
  const placement: TeamId[] = [champion]
  const runnerUp = slotLoser(final, matches)
  if (runnerUp) placement.push(runnerUp)

  if (rounds >= 2) {
    const third = bySlotId.get('3P')
    const sfLosers = [bySlotId.get(`R${rounds - 1}-0`), bySlotId.get(`R${rounds - 1}-1`)]
      .map((s) => (s ? slotLoser(s, matches) : null))
      .filter((t): t is TeamId => t !== null)
    if (third?.matchId && matches[third.matchId]?.winner) {
      placement.push(slotWinner(third, matches, state.seedOrder)!, slotLoser(third, matches)!)
    } else {
      const pos = new Map(fallbackOrder.map((id, i) => [id, i]))
      placement.push(...sfLosers.sort((a, b) => (pos.get(a) ?? 99) - (pos.get(b) ?? 99)))
    }
  }
  return placement
}
