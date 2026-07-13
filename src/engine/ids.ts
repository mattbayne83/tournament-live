import type { CourtId, DivisionId } from '../types/tournament'

/**
 * Match ids are deterministic functions of their position in the tournament
 * structure — no RNG, so replay and resume can never mint conflicting ids.
 */
export function ladderMatchId(divisionId: DivisionId, roundIndex: number, courtId: CourtId): string {
  return `m-${divisionId}-L${roundIndex}-C${courtId}`
}

export function poolMatchId(divisionId: DivisionId, poolId: string, gameIndex: number): string {
  return `m-${divisionId}-${poolId}-G${gameIndex}`
}

export function bracketMatchId(divisionId: DivisionId, slotId: string): string {
  return `m-${divisionId}-B-${slotId}`
}
