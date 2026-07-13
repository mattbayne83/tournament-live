import { Trophy } from 'lucide-react'
import type { BracketState, Match, Team, TeamId } from '../../types/tournament'
import { ScoreCard } from './ScoreCards'

const roundName = (round: number, rounds: number) =>
  round === rounds ? 'Final' : round === rounds - 1 ? 'Semifinals' : round === rounds - 2 ? 'Quarterfinals' : `Round ${round}`

/**
 * Compact playoff panel for the admin: playing matches get live score cards,
 * the rest of the bracket renders as a results list.
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
  const rounds = Math.log2(bracket.size)
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

      <ul className="divide-y-2 divide-paper-2 border-2 border-line bg-white">
        {bracketMatches.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="w-24 shrink-0 font-cond font-bold uppercase tracking-wider text-text-soft">
              {roundName(m.roundIndex, rounds)}
            </span>
            <MatchLine match={m} teams={teams} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function MatchLine({ match, teams }: { match: Match; teams: Record<TeamId, Team> }) {
  const side = (teamId: TeamId | null, won: boolean) => (
    <span className={won ? 'font-bold text-flame-deep' : teamId ? 'font-semibold' : 'text-text-soft'}>
      {teamId ? teams[teamId]?.name : 'TBD'}
    </span>
  )
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
      {side(match.teamA, match.winner === 'a')}
      <span className="text-text-soft">vs</span>
      {side(match.teamB, match.winner === 'b')}
      {match.status === 'done' && match.score && (
        <span className="tabular ml-auto text-text-soft">
          {match.score.a}–{match.score.b}
        </span>
      )}
      {match.status === 'forfeit' && <span className="ml-auto font-cond text-xs uppercase text-text-soft">forfeit</span>}
      {match.status === 'playing' && (
        <span className="ml-auto font-cond text-xs font-bold uppercase tracking-wider text-court">On court {match.courtId}</span>
      )}
    </span>
  )
}
