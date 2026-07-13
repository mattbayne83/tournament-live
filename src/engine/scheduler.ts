import type { CourtId, Match, MatchId } from '../types/tournament'

/**
 * Priority order for the waiting queue: bracket games before pool games,
 * earlier rounds first, then stable by id for determinism.
 */
export function queuedInPriorityOrder(matches: Match[]): Match[] {
  return matches
    .filter((m) => m.status === 'queued' && m.teamA !== null && m.teamB !== null)
    .sort((x, y) => {
      if (x.phase !== y.phase) return x.phase === 'bracket' ? -1 : 1
      if (x.roundIndex !== y.roundIndex) return x.roundIndex - y.roundIndex
      return x.id < y.id ? -1 : 1
    })
}

/**
 * Greedily fills free courts from the priority queue, never scheduling a team
 * that is already on a court. Ladder divisions don't use this — their rounds
 * start all courts at once.
 */
export function nextAssignments(
  courtIds: CourtId[],
  matches: Match[],
): Array<{ matchId: MatchId; courtId: CourtId }> {
  const busyCourts = new Set<CourtId>()
  const busyTeams = new Set<string>()
  for (const m of matches) {
    if (m.status !== 'playing') continue
    if (m.courtId !== null) busyCourts.add(m.courtId)
    if (m.teamA) busyTeams.add(m.teamA)
    if (m.teamB) busyTeams.add(m.teamB)
  }
  const freeCourts = [...courtIds].sort((a, b) => a - b).filter((c) => !busyCourts.has(c))

  const assignments: Array<{ matchId: MatchId; courtId: CourtId }> = []
  for (const m of queuedInPriorityOrder(matches)) {
    if (freeCourts.length === 0) break
    if (busyTeams.has(m.teamA!) || busyTeams.has(m.teamB!)) continue
    assignments.push({ matchId: m.id, courtId: freeCourts.shift()! })
    busyTeams.add(m.teamA!)
    busyTeams.add(m.teamB!)
  }
  return assignments
}
