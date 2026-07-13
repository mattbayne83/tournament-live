export type TeamId = string
export type DivisionId = string
export type MatchId = string
/** Physical court number, 1-based. */
export type CourtId = number

export interface Tournament {
  schemaVersion: 1
  /** Public URL slug; unguessable base32. */
  id: string
  name: string
  status: 'setup' | 'live' | 'complete'
  /** Monotonic revision, bumped by every commit. Drives ETag + last-write-wins. */
  rev: number
  updatedAt: string
  courtsTotal: number
  teams: Record<TeamId, Team>
  /** Flat across all divisions and phases — enables a single court-grid view. */
  matches: Record<MatchId, Match>
  divisions: Division[]
}

export interface Team {
  id: TeamId
  divisionId: DivisionId
  name: string
  players: [string, string]
  status: 'active' | 'withdrawn'
}

export interface Division {
  id: DivisionId
  name: string
  /** Courts this division currently owns; editable between rounds. */
  courtIds: CourtId[]
  status: 'setup' | 'active' | 'paused' | 'complete'
  format: FormatState
}

export type FormatState =
  | { kind: 'ladder'; config: LadderConfig; state: LadderState }
  | { kind: 'pools'; config: PoolConfig; state: PoolState }
  | { kind: 'bracket'; config: BracketConfig; state: BracketState }

export interface Match {
  id: MatchId
  divisionId: DivisionId
  phase: 'ladder' | 'pool' | 'bracket'
  roundIndex: number
  poolId?: string
  bracketSlotId?: string
  courtId: CourtId | null
  /** null = TBD (bracket slot not yet fed). */
  teamA: TeamId | null
  teamB: TeamId | null
  score: { a: number; b: number } | null
  /** Explicit — timed ladder games can end tied on points; never inferred. */
  winner: 'a' | 'b' | null
  status: 'queued' | 'playing' | 'done' | 'voided' | 'forfeit'
}

export interface MatchResult {
  matchId: MatchId
  courtId: CourtId
  a: TeamId
  b: TeamId
  score: { a: number; b: number }
  winner: 'a' | 'b'
}

// --- Ladder ---

export interface LadderConfig {
  roundMinutes: number
  /** How a whistle tie is resolved on the court. */
  tieRule: 'suddenDeathPoint' | 'organizerPicks'
  exemptTopCourtFromByes: boolean
  playoffTopN: number
}

export interface TeamStats {
  w: number
  l: number
  pf: number
  pa: number
}

export interface RoundTimer {
  /** Epoch ms when the current round started; null when not running. */
  startedAt: number | null
  durationSec: number
  /** Set while paused; remaining seconds frozen at pause time. */
  pausedRemainingSec: number | null
}

export interface LadderState {
  /** index = ladder rank; ranks 2i, 2i+1 play on courtIds[i]. */
  order: TeamId[]
  roundIndex: number
  roundPhase: 'idle' | 'playing' | 'scoring'
  currentMatchIds: MatchId[]
  currentSitters: TeamId[]
  byeCounts: Record<TeamId, number>
  /** Round index of each team's most recent bye; -1 if never. */
  lastByeRound: Record<TeamId, number>
  stats: Record<TeamId, TeamStats>
  timer: RoundTimer
  /** Per-round inputs — enables deterministic replay for corrections. */
  history: LadderRoundRecord[]
  playoff: LadderPlayoff | null
}

export interface LadderPlayoff {
  bracket: BracketState | null
  extractedIds: TeamId[]
  /** Ladder order at extraction time; breaks semifinal-loser ties. */
  preExtractionSeeds: TeamId[]
  championshipCourt: CourtId
}

export interface LadderRoundRecord {
  roundIndex: number
  orderBefore: TeamId[]
  sitters: TeamId[]
  results: MatchResult[]
}

// --- Pools ---

export interface PoolConfig {
  poolSize: 3 | 4 | 5
  playoffTeamCount: number
  rngSeed: string
}

export interface Pool {
  id: string
  name: string
  teamIds: TeamId[]
  matchIds: MatchId[]
}

export interface PoolState {
  pools: Pool[]
  phase: 'pool' | 'playoff' | 'done'
  playoff: BracketState | null
}

// --- Bracket ---

export interface BracketConfig {
  thirdPlaceMatch: boolean
}

export type SlotSource =
  | { type: 'seed'; seed: number }
  | { type: 'winnerOf'; slotId: string }
  | { type: 'loserOf'; slotId: string }
  | { type: 'bye' }

export interface BracketSlot {
  /** e.g. 'R1-0', 'SF-1', 'F', '3P'. */
  id: string
  round: number
  index: number
  matchId: MatchId | null
  a: SlotSource
  b: SlotSource
}

export interface BracketState {
  size: 2 | 4 | 8 | 16 | 32 | 64
  seedOrder: TeamId[]
  slots: BracketSlot[]
  championId: TeamId | null
}

// --- Standings ---

export interface StandingRow {
  teamId: TeamId
  rank: number
  w: number
  l: number
  pf: number
  pa: number
  diff: number
  /** Human-visible qualifier, e.g. "won tiebreak (coin)". */
  note?: string
}
