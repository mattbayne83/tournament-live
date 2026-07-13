import { describe, expect, it } from 'vitest'
import type { Match } from '../../types/tournament'
import { nextAssignments, queuedInPriorityOrder } from '../scheduler'

let seq = 0
function match(over: Partial<Match>): Match {
  return {
    id: `m${seq++}`,
    divisionId: 'd1',
    phase: 'pool',
    roundIndex: 0,
    courtId: null,
    teamA: 'A',
    teamB: 'B',
    score: null,
    winner: null,
    status: 'queued',
    ...over,
  }
}

describe('queuedInPriorityOrder', () => {
  it('puts bracket games first, then earlier rounds', () => {
    const pool2 = match({ phase: 'pool', roundIndex: 2 })
    const pool0 = match({ phase: 'pool', roundIndex: 0 })
    const bracket = match({ phase: 'bracket', roundIndex: 1 })
    const tbd = match({ phase: 'bracket', teamB: null })
    expect(queuedInPriorityOrder([pool2, pool0, bracket, tbd])).toEqual([bracket, pool0, pool2])
  })
})

describe('nextAssignments', () => {
  it('fills only free courts and never double-books a team', () => {
    const playing = match({ status: 'playing', courtId: 5, teamA: 'A', teamB: 'B' })
    const wantsBusyTeam = match({ teamA: 'A', teamB: 'C' })
    const ready1 = match({ teamA: 'D', teamB: 'E' })
    const ready2 = match({ teamA: 'F', teamB: 'G' })
    const ready3 = match({ teamA: 'H', teamB: 'I' })
    const out = nextAssignments([5, 6, 7], [playing, wantsBusyTeam, ready1, ready2, ready3])
    expect(out).toEqual([
      { matchId: ready1.id, courtId: 6 },
      { matchId: ready2.id, courtId: 7 },
    ])
  })

  it('assigns nothing when all courts are busy', () => {
    const playing = match({ status: 'playing', courtId: 1 })
    const waiting = match({ teamA: 'X', teamB: 'Y' })
    expect(nextAssignments([1], [playing, waiting])).toEqual([])
  })
})
