import type { Division } from '../types/tournament'

/**
 * Honest day-of math shown while configuring a division: how much everyone
 * actually plays, and whether the format fits the block. Game length is
 * assumed ~13 minutes including switchover.
 */
export function capacityNotes(div: Division, teamCount: number): string[] {
  const courts = div.courtIds.length
  if (courts === 0 || teamCount === 0) return []
  if (div.format.kind === 'ladder') {
    let playing = Math.min(courts * 2, teamCount)
    if (playing % 2 === 1) playing -= 1
    const sitting = teamCount - playing
    const roundsPerHour = Math.floor(60 / (div.format.config.roundMinutes + 1))
    return [
      `${playing} play / ${sitting} sit each round`,
      `~${roundsPerHour * 2} rounds in a 2-hour block`,
      sitting > playing ? '⚠ more sitting than playing — consider pools or more courts' : '',
    ].filter(Boolean)
  }
  if (div.format.kind !== 'pools') return []
  const size = div.format.config.poolSize
  const poolCount = Math.ceil(teamCount / size)
  const base = Math.floor(teamCount / poolCount)
  const bigPools = teamCount % poolCount
  const games = (bigPools * (base + 1) * base) / 2 + ((poolCount - bigPools) * base * (base - 1)) / 2
  const waves = Math.ceil(games / courts)
  const playoffGames = Math.max(0, div.format.config.playoffTeamCount - 1)
  const estMinutes = Math.round((waves + Math.ceil(playoffGames / courts) * 1.4) * 13)
  return [
    `${poolCount} pools · ${games} pool games (${base - 1}–${base} games per team)`,
    `${waves} waves on ${courts} courts + playoff ≈ ${Math.floor(estMinutes / 60)}h ${estMinutes % 60}m`,
  ]
}
