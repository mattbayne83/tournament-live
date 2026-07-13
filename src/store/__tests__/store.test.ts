import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatchResult } from '../../types/tournament'
import { createPersistence } from '../persistence'
import { useAppStore } from '../store'

const store = useAppStore

function setupLadderDivision(teamCount: number, courts: number[]) {
  store.getState().createTournament('UW ONEOK Pickleball', 8)
  const divId = store.getState().addDivision('Competitive', 'ladder')
  store.getState().setTeams(
    divId,
    Array.from({ length: teamCount }, (_, i) => ({
      name: `Team ${i + 1}`,
      players: ['P1', 'P2'] as [string, string],
    })),
  )
  store.getState().updateDivisionCourts(divId, courts)
  return divId
}

function currentRoundResults(divId: string, winnerSide: 'a' | 'b'): MatchResult[] {
  const t = store.getState().tournament!
  const div = t.divisions.find((d) => d.id === divId)!
  if (div.format.kind !== 'ladder') throw new Error()
  return div.format.state.currentMatchIds.map((id) => {
    const m = t.matches[id]
    return {
      matchId: id,
      courtId: m.courtId!,
      a: m.teamA!,
      b: m.teamB!,
      score: winnerSide === 'a' ? { a: 11, b: 5 } : { a: 5, b: 11 },
      winner: winnerSide,
    }
  })
}

beforeEach(() => {
  store.getState().closeTournament()
})

describe('ladder division lifecycle', () => {
  it('runs setup → live → round → finalize with matches and history', () => {
    const divId = setupLadderDivision(10, [1, 2, 3, 4])
    store.getState().goLive()
    expect(store.getState().tournament!.status).toBe('live')

    store.getState().ladderStartRound(divId, 1_000_000)
    let div = store.getState().tournament!.divisions[0]
    if (div.format.kind !== 'ladder') throw new Error()
    expect(div.format.state.currentMatchIds).toHaveLength(4)
    expect(div.format.state.currentSitters).toHaveLength(2)
    expect(div.format.state.timer.startedAt).toBe(1_000_000)

    store.getState().ladderFinalizeRound(divId, currentRoundResults(divId, 'b'))
    div = store.getState().tournament!.divisions[0]
    if (div.format.kind !== 'ladder') throw new Error()
    expect(div.format.state.roundIndex).toBe(1)
    expect(div.format.state.history).toHaveLength(1)
    const done = Object.values(store.getState().tournament!.matches).filter((m) => m.status === 'done')
    expect(done).toHaveLength(4)
  })

  it('extracts a top-4 playoff whose bracket lives on the championship court', () => {
    const divId = setupLadderDivision(10, [1, 2, 3, 4])
    store.getState().goLive()
    store.getState().ladderExtractPlayoff(divId, 1)
    const t = store.getState().tournament!
    const div = t.divisions[0]
    if (div.format.kind !== 'ladder') throw new Error()
    expect(div.format.state.order).toHaveLength(6)
    expect(div.format.state.playoff?.bracket?.size).toBe(4)
    const semis = Object.values(t.matches).filter((m) => m.phase === 'bracket')
    expect(semis).toHaveLength(3) // 2 semis + final
    // Only one semi fits the championship court; the other waits.
    expect(semis.filter((m) => m.status === 'playing' && m.courtId === 1)).toHaveLength(1)
    // Next ladder round avoids court 1.
    store.getState().ladderStartRound(divId)
    const ladderMatches = Object.values(store.getState().tournament!.matches).filter(
      (m) => m.phase === 'ladder' && m.status === 'playing',
    )
    expect(ladderMatches.every((m) => m.courtId !== 1)).toBe(true)
  })

  it('completing the playoff frees the championship court back to the ladder', () => {
    const divId = setupLadderDivision(10, [1, 2])
    store.getState().goLive()
    store.getState().ladderExtractPlayoff(divId, 1)
    const playBracket = () => {
      const m = Object.values(store.getState().tournament!.matches).find(
        (x) => x.phase === 'bracket' && x.status === 'playing',
      )
      if (!m) return false
      store.getState().enterMatchScore(m.id, { a: 11, b: 4 }, 'a')
      return true
    }
    while (playBracket()) { /* play semis then final */ }
    const div = store.getState().tournament!.divisions[0]
    if (div.format.kind !== 'ladder') throw new Error()
    expect(div.format.state.playoff?.bracket?.championId).not.toBeNull()
    store.getState().ladderStartRound(divId)
    const courts = Object.values(store.getState().tournament!.matches)
      .filter((m) => m.phase === 'ladder' && m.status === 'playing')
      .map((m) => m.courtId)
    expect(courts).toContain(1)
  })
})

describe('pools division lifecycle', () => {
  function setupPools() {
    store.getState().createTournament('UW ONEOK Pickleball', 8)
    const divId = store.getState().addDivision('Recreational', 'pools')
    store.getState().setTeams(
      divId,
      Array.from({ length: 8 }, (_, i) => ({ name: `Rec ${i + 1}`, players: ['A', 'B'] as [string, string] })),
    )
    store.getState().updateDivisionCourts(divId, [5, 6, 7, 8])
    return divId
  }

  it('go-live draws pools, schedules games, and fills the courts', () => {
    const divId = setupPools()
    store.getState().goLive()
    const t = store.getState().tournament!
    const div = t.divisions[0]
    if (div.format.kind !== 'pools') throw new Error()
    expect(div.format.state.pools).toHaveLength(2)
    const poolMatches = Object.values(t.matches).filter((m) => m.phase === 'pool')
    expect(poolMatches).toHaveLength(12)
    expect(poolMatches.filter((m) => m.status === 'playing')).toHaveLength(4)
    void divId
  })

  it('scoring frees the court for the next queued game and playoff completes the division', () => {
    const divId = setupPools()
    store.getState().goLive()
    const playAll = () => {
      for (;;) {
        const m = Object.values(store.getState().tournament!.matches).find((x) => x.status === 'playing')
        if (!m) break
        store.getState().enterMatchScore(m.id, { a: 11, b: 6 }, 'a')
      }
    }
    playAll()
    const done = Object.values(store.getState().tournament!.matches).filter((m) => m.status === 'done')
    expect(done).toHaveLength(12)

    store.getState().poolsStartPlayoff(divId)
    let div = store.getState().tournament!.divisions[0]
    if (div.format.kind !== 'pools') throw new Error()
    expect(div.format.state.phase).toBe('playoff')
    expect(div.format.state.playoff?.size).toBe(8)

    playAll()
    div = store.getState().tournament!.divisions[0]
    if (div.format.kind !== 'pools') throw new Error()
    expect(div.format.state.playoff?.championId).not.toBeNull()
    expect(div.status).toBe('complete')
  })

  it('withdrawing a team forfeits its remaining games to the opponent', () => {
    setupPools()
    store.getState().goLive()
    const anyMatch = Object.values(store.getState().tournament!.matches)[0]
    const victim = anyMatch.teamA!
    store.getState().withdrawTeam(victim)
    const t = store.getState().tournament!
    expect(t.teams[victim].status).toBe('withdrawn')
    const victimMatches = Object.values(t.matches).filter((m) => m.teamA === victim || m.teamB === victim)
    expect(victimMatches.every((m) => m.status === 'forfeit')).toBe(true)
    expect(victimMatches.every((m) => (m.teamA === victim ? m.winner === 'b' : m.winner === 'a'))).toBe(true)
  })
})

describe('undo/redo', () => {
  it('restores the snapshot but keeps rev strictly increasing for LWW', () => {
    const divId = setupLadderDivision(8, [1, 2, 3, 4])
    store.getState().goLive()
    store.getState().ladderStartRound(divId)
    const revBefore = store.getState().tournament!.rev
    const orderBefore = (() => {
      const d = store.getState().tournament!.divisions[0]
      return d.format.kind === 'ladder' ? d.format.state.order : []
    })()

    store.getState().ladderFinalizeRound(divId, currentRoundResults(divId, 'b'))
    store.getState().undo()
    const t = store.getState().tournament!
    const div = t.divisions[0]
    if (div.format.kind !== 'ladder') throw new Error()
    expect(div.format.state.order).toEqual(orderBefore)
    expect(div.format.state.roundIndex).toBe(0)
    expect(t.rev).toBeGreaterThan(revBefore + 1)

    store.getState().redo()
    const redone = store.getState().tournament!.divisions[0]
    if (redone.format.kind !== 'ladder') throw new Error()
    expect(redone.format.state.roundIndex).toBe(1)
  })

  it('a failed commit leaves state untouched', () => {
    setupLadderDivision(8, [1, 2])
    const before = store.getState().tournament
    expect(() => store.getState().setLadderSeedOrder('nope', [])).toThrow()
    expect(store.getState().tournament).toBe(before)
  })
})

describe('persistence', () => {
  function fakeStorage(): Storage {
    const m = new Map<string, string>()
    return {
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
      key: (i) => [...m.keys()][i] ?? null,
      get length() {
        return m.size
      },
    }
  }

  it('round-trips the tournament and admin key through storage', () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    const persistence = createPersistence(store, storage, 300)

    setupLadderDivision(6, [1, 2, 3])
    const saved = store.getState().tournament!
    const savedKey = store.getState().adminKey
    vi.advanceTimersByTime(400)

    store.getState().closeTournament()
    expect(store.getState().tournament).toBeNull()

    expect(persistence.loadCurrent()).toBe(false) // closing cleared the pointer
    storage.setItem('pbt:currentId', saved.id) // simulate a fresh visit instead
    expect(persistence.loadCurrent()).toBe(true)
    expect(store.getState().tournament?.id).toBe(saved.id)
    expect(store.getState().tournament?.rev).toBe(saved.rev)
    expect(store.getState().adminKey).toBe(savedKey)

    persistence.stop()
    vi.useRealTimers()
  })

  it('flush writes immediately without waiting for the debounce', () => {
    vi.useFakeTimers()
    const storage = fakeStorage()
    const persistence = createPersistence(store, storage, 300)
    setupLadderDivision(6, [1])
    persistence.flush()
    const raw = storage.getItem(`pbt:t:${store.getState().tournament!.id}`)
    expect(raw).not.toBeNull()
    persistence.stop()
    vi.useRealTimers()
  })
})
