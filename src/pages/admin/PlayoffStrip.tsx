import { Trophy } from 'lucide-react'
import { BracketView } from '../../components/BracketView'
import type { BracketState, Match, Team, TeamId } from '../../types/tournament'
import { ScoreCard } from './ScoreCards'

/**
 * Playoff panel for the admin: playing matches get live score cards, and the
 * whole bracket renders as the same graphic the TV board uses.
 */
export function PlayoffStrip({
  bracket,
  matches,
  teams,
}: {
  bracket: BracketState
  matches: Record<string, Match>
  teams: Record<TeamId, Team>
}) {
  const bracketMatches = bracket.slots
    .map((s) => (s.matchId ? matches[s.matchId] : null))
    .filter((m): m is Match => m !== null)
  const playing = bracketMatches.filter((m) => m.status === 'playing')
  const champion = bracket.championId ? teams[bracket.championId] : null

  return (
    <section className="space-y-3">
      <h3 className="font-display text-2xl uppercase">Playoff</h3>

      {champion && (
        <div className="flex items-center gap-3 border-2 border-gold bg-ink px-5 py-4">
          <Trophy className="text-gold" size={28} />
          <div>
            <p className="font-cond text-xs font-bold uppercase tracking-[0.25em] text-gold">Champions</p>
            <p className="font-display text-2xl uppercase text-board-text">{champion.name}</p>
          </div>
        </div>
      )}

      {playing.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {playing.map((m) => (
            <ScoreCard key={m.id} match={m} teams={teams} mode="commit" />
          ))}
        </div>
      )}

      <div className="border-2 border-ink bg-ink p-4">
        <BracketView bracket={bracket} matches={matches} teams={teams} compact />
      </div>
    </section>
  )
}
