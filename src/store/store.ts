import { create } from 'zustand'
import { newAdminKey, newTournamentId, shortId } from '../api/keys'
import { bracketPlacement, buildBracket, reportBracketResult } from '../engine/bracket'
import {
  applyRoundResults,
  extractPlayoff,
  pairNextRound,
  pauseTimer,
  removeTeam,
  replayLadder,
  resumeTimer,
  seedLadder,
  startTimer,
} from '../engine/ladder'
import { generatePools, poolSchedule, poolStandings, seedPlayoffFromPools } from '../engine/pools'
import { nextAssignments } from '../engine/scheduler'
import type {
  CourtId,
  Division,
  DivisionId,
  LadderConfig,
  MatchId,
  MatchResult,
  PoolConfig,
  TeamId,
  Tournament,
} from '../types/tournament'
import { buildSampleTeams } from '../utils/sampleTeams'

export interface ScoreDraft {
  a: number
  b: number
  /** Explicit pick for whistle ties, where the score alone can't decide. */
  winner?: 'a' | 'b'
}

export interface SyncState {
  status: 'idle' | 'publishing' | 'offline' | 'error'
  lastPublishedRev: number
  publishCount: number
  dirty: boolean
  lastError?: string
}

interface UndoEntry {
  label: string
  snapshot: Tournament
}

export interface AppStore {
  tournament: Tournament | null
  adminKey: string | null
  past: UndoEntry[]
  future: UndoEntry[]
  sync: SyncState
  ui: {
    activeDivisionId: DivisionId | null
    scoreDrafts: Record<MatchId, ScoreDraft>
  }

  commit: (label: string, mutate: (t: Tournament) => void, opts?: { undoable?: boolean }) => void
  undo: () => void
  redo: () => void

  createTournament: (name: string, courtsTotal: number) => void
  /** Full dry-run setup: Competitive ladder + Rec pools, sample teams, courts split. */
  loadDemoTournament: () => void
  loadTournament: (t: Tournament, adminKey: string | null) => void
  closeTournament: () => void
  /** Mark the event finished — all divisions complete. */
  endTournament: () => void
  /**
   * Wipe live progress and return to setup with the same teams, divisions,
   * and courts (re-run from go-live without re-entering rosters).
   */
  resetTournament: () => void

  addDivision: (name: string, format: 'ladder' | 'pools') => DivisionId
  removeDivision: (divisionId: DivisionId) => void
  updateDivisionCourts: (divisionId: DivisionId, courtIds: CourtId[]) => void
  updateLadderConfig: (divisionId: DivisionId, changes: Partial<LadderConfig>) => void
  updatePoolConfig: (divisionId: DivisionId, changes: Partial<PoolConfig>) => void
  setTeams: (divisionId: DivisionId, entries: Array<{ name: string; players: [string, string] }>) => void
  setLadderSeedOrder: (divisionId: DivisionId, order: TeamId[]) => void
  regeneratePools: (divisionId: DivisionId, rngSeed?: string) => void
  goLive: () => void

  ladderStartRound: (divisionId: DivisionId, now?: number) => void
  ladderFinalizeRound: (divisionId: DivisionId, results: MatchResult[]) => void
  ladderExtractPlayoff: (divisionId: DivisionId, championshipCourt: CourtId) => void
  /**
   * Corrects a past ladder round. 'stats' fixes W/L/PF/PA but keeps positions
   * as physically played (the default — people already stood where the old
   * result put them); 'replay' recomputes positions from the corrected round
   * forward and is only allowed before a playoff extraction.
   */
  correctLadderRound: (divisionId: DivisionId, roundIndex: number, results: MatchResult[], mode: 'stats' | 'replay') => void
  timerPause: (divisionId: DivisionId, now?: number) => void
  timerResume: (divisionId: DivisionId, now?: number) => void

  enterMatchScore: (matchId: MatchId, score: { a: number; b: number }, winner: 'a' | 'b') => void
  forfeitMatch: (matchId: MatchId, winner: 'a' | 'b') => void
  assignCourts: (divisionId: DivisionId) => void
  poolsStartPlayoff: (divisionId: DivisionId) => void
  withdrawTeam: (teamId: TeamId) => void
  endDivision: (divisionId: DivisionId) => void

  setActiveDivision: (divisionId: DivisionId | null) => void
  setScoreDraft: (matchId: MatchId, draft: ScoreDraft) => void
  clearScoreDraft: (matchId: MatchId) => void
}

const UNDO_CAP = 30

const defaultLadderConfig: LadderConfig = {
  roundMinutes: 12,
  tieRule: 'suddenDeathPoint',
  exemptTopCourtFromByes: true,
  playoffTopN: 4,
}

const defaultPoolConfig = (): PoolConfig => ({
  poolSize: 4,
  playoffTeamCount: 8,
  rngSeed: shortId('draw'),
})

function division(t: Tournament, divisionId: DivisionId): Division {
  const div = t.divisions.find((d) => d.id === divisionId)
  if (!div) throw new Error(`unknown division ${divisionId}`)
  return div
}

function divisionTeamIds(t: Tournament, divisionId: DivisionId, onlyActive = true): TeamId[] {
  return Object.values(t.teams)
    .filter((team) => team.divisionId === divisionId && (!onlyActive || team.status === 'active'))
    .map((team) => team.id)
}

/** Courts the ladder itself may use — the championship court belongs to the playoff until it crowns a champion. */
export function ladderCourts(div: Division): CourtId[] {
  if (div.format.kind !== 'ladder') return div.courtIds
  const playoff = div.format.state.playoff
  if (playoff && playoff.bracket && !playoff.bracket.championId) {
    return div.courtIds.filter((c) => c !== playoff.championshipCourt)
  }
  return div.courtIds
}

/** Queues waiting pool/bracket matches onto this division's free courts. */
function autoAssign(t: Tournament, div: Division) {
  const candidates = Object.values(t.matches).filter(
    (m) => m.divisionId === div.id && m.phase !== 'ladder',
  )
  const courts =
    div.format.kind === 'ladder'
      ? div.format.state.playoff
        ? [div.format.state.playoff.championshipCourt]
        : []
      : div.courtIds
  for (const { matchId, courtId } of nextAssignments(courts, candidates)) {
    t.matches[matchId] = { ...t.matches[matchId], courtId, status: 'playing' }
  }
}

/** Applies a completed bracket match: propagation, champion, division wrap-up. */
function settleBracketMatch(t: Tournament, matchId: MatchId) {
  const match = t.matches[matchId]
  const div = division(t, match.divisionId)
  const bracket =
    div.format.kind === 'pools' ? div.format.state.playoff : div.format.kind === 'ladder' ? div.format.state.playoff?.bracket : null
  if (!bracket) throw new Error('no active bracket for this match')

  const { state, updatedMatches } = reportBracketResult(bracket, t.matches, matchId)
  for (const m of updatedMatches) t.matches[m.id] = m

  if (div.format.kind === 'pools') {
    div.format.state.playoff = state
    if (state.championId) {
      div.format.state.phase = 'done'
      div.status = 'complete'
    }
  } else if (div.format.kind === 'ladder' && div.format.state.playoff) {
    div.format.state.playoff.bracket = state
  }
}

export const useAppStore = create<AppStore>()((set, get) => {
  const commit: AppStore['commit'] = (label, mutate, opts = {}) => {
    const { tournament, past } = get()
    if (!tournament) throw new Error('no tournament loaded')
    const next = structuredClone(tournament)
    mutate(next)
    next.rev = tournament.rev + 1
    next.updatedAt = new Date().toISOString()
    set({
      tournament: next,
      past:
        opts.undoable === false
          ? past
          : [...past, { label, snapshot: tournament }].slice(-UNDO_CAP),
      future: [],
      sync: { ...get().sync, dirty: true },
    })
  }

  const withDivision = (label: string, divisionId: DivisionId, fn: (t: Tournament, div: Division) => void, opts?: { undoable?: boolean }) =>
    commit(label, (t) => fn(t, division(t, divisionId)), opts)

  return {
    tournament: null,
    adminKey: null,
    past: [],
    future: [],
    sync: { status: 'idle', lastPublishedRev: 0, publishCount: 0, dirty: false },
    ui: { activeDivisionId: null, scoreDrafts: {} },

    commit,

    undo: () => {
      const { tournament, past, future } = get()
      if (!tournament || past.length === 0) return
      const entry = past[past.length - 1]
      set({
        tournament: { ...entry.snapshot, rev: tournament.rev + 1, updatedAt: new Date().toISOString() },
        past: past.slice(0, -1),
        future: [...future, { label: entry.label, snapshot: tournament }],
        sync: { ...get().sync, dirty: true },
      })
    },

    redo: () => {
      const { tournament, past, future } = get()
      if (!tournament || future.length === 0) return
      const entry = future[future.length - 1]
      set({
        tournament: { ...entry.snapshot, rev: tournament.rev + 1, updatedAt: new Date().toISOString() },
        future: future.slice(0, -1),
        past: [...past, { label: entry.label, snapshot: tournament }],
        sync: { ...get().sync, dirty: true },
      })
    },

    createTournament: (name, courtsTotal) => {
      set({
        tournament: {
          schemaVersion: 1,
          id: newTournamentId(),
          name,
          status: 'setup',
          rev: 1,
          updatedAt: new Date().toISOString(),
          courtsTotal,
          teams: {},
          matches: {},
          divisions: [],
        },
        adminKey: newAdminKey(),
        past: [],
        future: [],
        sync: { status: 'idle', lastPublishedRev: 0, publishCount: 0, dirty: true },
        ui: { activeDivisionId: null, scoreDrafts: {} },
      })
    },

    loadDemoTournament: () => {
      get().createTournament('Demo Tournament', 8)
      const compId = get().addDivision('Competitive', 'ladder')
      const recId = get().addDivision('Recreational', 'pools')
      get().setTeams(compId, buildSampleTeams(16, 0))
      get().setTeams(recId, buildSampleTeams(16, 12))
      get().updateDivisionCourts(compId, [1, 2, 3, 4])
      get().updateDivisionCourts(recId, [5, 6, 7, 8])
      set((s) => ({ ui: { ...s.ui, activeDivisionId: compId } }))
    },

    loadTournament: (t, adminKey) => {
      set({
        tournament: t,
        adminKey,
        past: [],
        future: [],
        sync: { status: 'idle', lastPublishedRev: 0, publishCount: 0, dirty: false },
        ui: { activeDivisionId: t.divisions[0]?.id ?? null, scoreDrafts: {} },
      })
    },

    closeTournament: () => {
      set({
        tournament: null,
        adminKey: null,
        past: [],
        future: [],
        sync: { status: 'idle', lastPublishedRev: 0, publishCount: 0, dirty: false },
        ui: { activeDivisionId: null, scoreDrafts: {} },
      })
    },

    endTournament: () => {
      const { tournament } = get()
      if (!tournament) throw new Error('no tournament loaded')
      if (tournament.status === 'setup') throw new Error('tournament has not gone live')
      commit('End tournament', (t) => {
        t.status = 'complete'
        for (const div of t.divisions) div.status = 'complete'
      })
    },

    resetTournament: () => {
      const { tournament } = get()
      if (!tournament) throw new Error('no tournament loaded')
      // Rebuild as a fresh setup snapshot of the same event (teams/courts/configs kept).
      const next = structuredClone(tournament)
      next.status = 'setup'
      next.matches = {}
      next.rev = tournament.rev + 1
      next.updatedAt = new Date().toISOString()
      for (const team of Object.values(next.teams)) team.status = 'active'
      for (const div of next.divisions) {
        div.status = 'setup'
        const teamIds = Object.values(next.teams)
          .filter((team) => team.divisionId === div.id)
          .map((team) => team.id)
        if (div.format.kind === 'ladder') {
          div.format.state = seedLadder(teamIds, div.format.config)
        } else if (div.format.kind === 'pools') {
          div.format.state = { pools: [], phase: 'pool', playoff: null }
        } else {
          div.format.state = { size: 2, seedOrder: [], slots: [], championId: null }
        }
      }
      set({
        tournament: next,
        past: [],
        future: [],
        sync: { ...get().sync, dirty: true },
        ui: { activeDivisionId: next.divisions[0]?.id ?? null, scoreDrafts: {} },
      })
    },

    addDivision: (name, format) => {
      const id = shortId('d')
      commit(`Add division: ${name}`, (t) => {
        t.divisions.push({
          id,
          name,
          courtIds: [],
          status: 'setup',
          format:
            format === 'ladder'
              ? { kind: 'ladder', config: { ...defaultLadderConfig }, state: seedLadder([], defaultLadderConfig) }
              : { kind: 'pools', config: defaultPoolConfig(), state: { pools: [], phase: 'pool', playoff: null } },
        })
      })
      set((s) => ({ ui: { ...s.ui, activeDivisionId: id } }))
      return id
    },

    removeDivision: (divisionId) =>
      commit('Remove division', (t) => {
        if (division(t, divisionId).status !== 'setup') throw new Error('division already live')
        t.divisions = t.divisions.filter((d) => d.id !== divisionId)
        for (const team of Object.values(t.teams)) {
          if (team.divisionId === divisionId) delete t.teams[team.id]
        }
        for (const m of Object.values(t.matches)) {
          if (m.divisionId === divisionId) delete t.matches[m.id]
        }
      }),

    updateDivisionCourts: (divisionId, courtIds) =>
      withDivision('Update courts', divisionId, (_t, div) => {
        if (div.format.kind === 'ladder' && div.format.state.roundPhase !== 'idle') {
          throw new Error('change courts between rounds')
        }
        div.courtIds = [...courtIds].sort((a, b) => a - b)
      }),

    updateLadderConfig: (divisionId, changes) =>
      withDivision('Update ladder settings', divisionId, (_t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        div.format.config = { ...div.format.config, ...changes }
        if (changes.roundMinutes && div.format.state.roundPhase === 'idle') {
          div.format.state.timer.durationSec = changes.roundMinutes * 60
        }
      }),

    updatePoolConfig: (divisionId, changes) =>
      withDivision('Update pool settings', divisionId, (_t, div) => {
        if (div.format.kind !== 'pools') throw new Error('not a pools division')
        if (div.status !== 'setup' && (changes.poolSize || changes.rngSeed)) {
          throw new Error('pool draw is locked once live')
        }
        div.format.config = { ...div.format.config, ...changes }
      }),

    setTeams: (divisionId, entries) =>
      withDivision('Set teams', divisionId, (t, div) => {
        if (div.status !== 'setup') throw new Error('teams are locked once live')
        for (const team of Object.values(t.teams)) {
          if (team.divisionId === divisionId) delete t.teams[team.id]
        }
        const ids: TeamId[] = []
        for (const entry of entries) {
          const id = shortId('t')
          ids.push(id)
          t.teams[id] = { id, divisionId, name: entry.name, players: entry.players, status: 'active' }
        }
        if (div.format.kind === 'ladder') {
          div.format.state = seedLadder(ids, div.format.config)
        }
      }),

    setLadderSeedOrder: (divisionId, order) =>
      withDivision('Reorder seeds', divisionId, (t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        if (div.status !== 'setup') throw new Error('seeding is locked once live')
        const active = new Set(divisionTeamIds(t, divisionId))
        if (order.length !== active.size || order.some((id) => !active.has(id))) {
          throw new Error('seed order must contain each team exactly once')
        }
        div.format.state = seedLadder(order, div.format.config)
      }),

    regeneratePools: (divisionId, rngSeed) =>
      withDivision('Redraw pools', divisionId, (t, div) => {
        if (div.format.kind !== 'pools') throw new Error('not a pools division')
        if (div.status !== 'setup') throw new Error('pool draw is locked once live')
        if (rngSeed) div.format.config.rngSeed = rngSeed
        for (const m of Object.values(t.matches)) {
          if (m.divisionId === divisionId) delete t.matches[m.id]
        }
        const pools = generatePools(divisionTeamIds(t, divisionId), div.format.config)
        for (const pool of pools) {
          const games = poolSchedule(pool, divisionId)
          pool.matchIds = games.map((m) => m.id)
          for (const m of games) t.matches[m.id] = m
        }
        div.format.state = { pools, phase: 'pool', playoff: null }
      }),

    goLive: () => {
      const { tournament } = get()
      if (!tournament) throw new Error('no tournament loaded')
      commit('Go live', (t) => {
        if (t.divisions.length === 0) throw new Error('add at least one division')
        for (const div of t.divisions) {
          const teamIds = divisionTeamIds(t, div.id)
          if (teamIds.length < 4) throw new Error(`${div.name} needs at least 4 teams`)
          if (div.courtIds.length === 0) throw new Error(`${div.name} has no courts assigned`)
          if (div.format.kind === 'pools' && div.format.state.pools.length === 0) {
            const pools = generatePools(teamIds, div.format.config)
            for (const pool of pools) {
              const games = poolSchedule(pool, div.id)
              pool.matchIds = games.map((m) => m.id)
              for (const m of games) t.matches[m.id] = m
            }
            div.format.state = { pools, phase: 'pool', playoff: null }
          }
          div.status = 'active'
          if (div.format.kind === 'pools') autoAssign(t, div)
        }
        t.status = 'live'
      })
    },

    ladderStartRound: (divisionId, now = Date.now()) =>
      withDivision('Start round', divisionId, (t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        const { state, newMatches } = pairNextRound(div.format.state, divisionId, ladderCourts(div), div.format.config)
        for (const m of newMatches) t.matches[m.id] = m
        div.format.state = { ...state, timer: startTimer(state.timer, now) }
      }),

    ladderFinalizeRound: (divisionId, results) =>
      withDivision('Finalize round', divisionId, (t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        for (const r of results) {
          const m = t.matches[r.matchId]
          if (!m) throw new Error(`unknown match ${r.matchId}`)
          t.matches[r.matchId] = { ...m, score: r.score, winner: r.winner, status: 'done' }
        }
        div.format.state = applyRoundResults(div.format.state, results)
      }),

    ladderExtractPlayoff: (divisionId, championshipCourt) =>
      withDivision('Extract playoff', divisionId, (t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        if (!div.courtIds.includes(championshipCourt)) throw new Error('championship court must belong to this division')
        const state = extractPlayoff(div.format.state, championshipCourt, div.format.config)
        const { state: bracket, matches } = buildBracket(state.playoff!.extractedIds, divisionId, {
          thirdPlaceMatch: false,
        })
        for (const m of matches) t.matches[m.id] = m
        div.format.state = { ...state, playoff: { ...state.playoff!, bracket } }
        autoAssign(t, div)
      }),

    correctLadderRound: (divisionId, roundIndex, results, mode) =>
      withDivision(`Correct round ${roundIndex + 1}`, divisionId, (t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        const state = div.format.state
        if (state.roundPhase !== 'idle') throw new Error('finish the current round first')
        const target = state.history.find((r) => r.roundIndex === roundIndex)
        if (!target) throw new Error(`no round ${roundIndex + 1} on record`)
        if (mode === 'replay' && state.playoff) throw new Error('positions are locked once the playoff is extracted')

        const records = state.history.map((r) => (r.roundIndex === roundIndex ? { ...r, results } : r))
        for (const r of results) {
          const m = t.matches[r.matchId]
          if (m) t.matches[r.matchId] = { ...m, score: r.score, winner: r.winner }
        }
        const seed = state.history[0]?.orderBefore ?? state.order
        const replayed = replayLadder(seed, div.format.config, records)
        div.format.state =
          mode === 'replay'
            ? { ...replayed, timer: state.timer, playoff: state.playoff }
            : { ...state, history: records, stats: replayed.stats }
      }),

    timerPause: (divisionId, now = Date.now()) =>
      withDivision('Pause timer', divisionId, (_t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        div.format.state.timer = pauseTimer(div.format.state.timer, now)
      }, { undoable: false }),

    timerResume: (divisionId, now = Date.now()) =>
      withDivision('Resume timer', divisionId, (_t, div) => {
        if (div.format.kind !== 'ladder') throw new Error('not a ladder division')
        div.format.state.timer = resumeTimer(div.format.state.timer, now)
      }, { undoable: false }),

    enterMatchScore: (matchId, score, winner) => {
      const label = `Score: ${matchId}`
      commit(label, (t) => {
        const m = t.matches[matchId]
        if (!m) throw new Error(`unknown match ${matchId}`)
        if (m.phase === 'ladder') throw new Error('ladder scores go through finalize round')
        t.matches[matchId] = { ...m, score, winner, status: 'done' }
        if (m.phase === 'bracket') settleBracketMatch(t, matchId)
        autoAssign(t, division(t, m.divisionId))
      })
      get().clearScoreDraft(matchId)
    },

    forfeitMatch: (matchId, winner) =>
      commit('Forfeit', (t) => {
        const m = t.matches[matchId]
        if (!m) throw new Error(`unknown match ${matchId}`)
        t.matches[matchId] = { ...m, score: null, winner, status: 'forfeit' }
        if (m.phase === 'bracket') settleBracketMatch(t, matchId)
        autoAssign(t, division(t, m.divisionId))
      }),

    assignCourts: (divisionId) =>
      withDivision('Assign courts', divisionId, (t, div) => autoAssign(t, div), { undoable: false }),

    poolsStartPlayoff: (divisionId) =>
      withDivision('Start playoff', divisionId, (t, div) => {
        if (div.format.kind !== 'pools') throw new Error('not a pools division')
        if (div.format.state.playoff) throw new Error('playoff already started')
        const cfg = div.format.config
        const all = Object.values(t.matches)
        const perPool = div.format.state.pools.map((p) => poolStandings(p, all, cfg.rngSeed))
        const seeds = seedPlayoffFromPools(perPool, cfg.playoffTeamCount)
        const { state, matches } = buildBracket(seeds, divisionId, { thirdPlaceMatch: false })
        for (const m of matches) t.matches[m.id] = m
        div.format.state.playoff = state
        div.format.state.phase = 'playoff'
        autoAssign(t, div)
      }),

    withdrawTeam: (teamId) =>
      commit('Withdraw team', (t) => {
        const team = t.teams[teamId]
        if (!team) throw new Error(`unknown team ${teamId}`)
        team.status = 'withdrawn'
        const div = division(t, team.divisionId)
        if (div.format.kind === 'ladder') {
          div.format.state = removeTeam(div.format.state, teamId)
        } else {
          // Remaining queued pool games become forfeit wins for the opponent.
          for (const m of Object.values(t.matches)) {
            if (m.divisionId !== div.id || m.status === 'done' || m.status === 'forfeit') continue
            if (m.teamA === teamId) t.matches[m.id] = { ...m, winner: 'b', score: null, status: 'forfeit' }
            if (m.teamB === teamId) t.matches[m.id] = { ...m, winner: 'a', score: null, status: 'forfeit' }
          }
          autoAssign(t, div)
        }
      }),

    endDivision: (divisionId) =>
      withDivision('End division', divisionId, (_t, div) => {
        div.status = 'complete'
      }),

    setActiveDivision: (divisionId) => set((s) => ({ ui: { ...s.ui, activeDivisionId: divisionId } })),
    setScoreDraft: (matchId, draft) =>
      set((s) => ({ ui: { ...s.ui, scoreDrafts: { ...s.ui.scoreDrafts, [matchId]: draft } } })),
    clearScoreDraft: (matchId) =>
      set((s) => {
        const { [matchId]: _, ...rest } = s.ui.scoreDrafts
        return { ui: { ...s.ui, scoreDrafts: rest } }
      }),
  }
})

/** Placement rows for a ladder division's mini-playoff, once its final is decided. */
export function ladderPlayoffPlacement(t: Tournament, div: Division): TeamId[] | undefined {
  if (div.format.kind !== 'ladder' || !div.format.state.playoff?.bracket) return undefined
  const placement = bracketPlacement(
    div.format.state.playoff.bracket,
    t.matches,
    div.format.state.playoff.preExtractionSeeds,
  )
  return placement.length > 0 ? placement : undefined
}
