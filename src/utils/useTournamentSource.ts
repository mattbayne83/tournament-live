import { useAppStore } from '../store/store'
import type { Tournament } from '../types/tournament'

export interface TournamentSource {
  tournament: Tournament | null
  /** Server-clock correction for countdowns; 0 when reading the local store. */
  offsetMs: number
  source: 'local' | 'remote'
}

/**
 * The board and live views render from whichever source fits the device:
 * on the organizer laptop this is the local store (zero lag, works with the
 * gym wifi down). Phase 7 adds the remote polling variant for `/t/:id/...`.
 */
export function useTournamentSource(): TournamentSource {
  const tournament = useAppStore((s) => s.tournament)
  return { tournament, offsetMs: 0, source: 'local' }
}
