import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Division, Match, Team, TeamId, Tournament } from '../../types/tournament'

interface GameLine {
  key: string
  courtId: number | null
  a: TeamId
  b: TeamId
  scoreA: number | null
  scoreB: number | null
  winner: 'a' | 'b'
  forfeit: boolean
}

interface RoundGroup {
  label: string
  games: GameLine[]
}

function ladderGroups(division: Division): RoundGroup[] {
  if (division.format.kind !== 'ladder') return []
  return division.format.state.history.map((record) => ({
    label: `Round ${record.roundIndex + 1}`,
    games: record.results.map((r) => ({
      key: r.matchId,
      courtId: r.courtId,
      a: r.a,
      b: r.b,
      scoreA: r.score.a,
      scoreB: r.score.b,
      winner: r.winner,
      forfeit: false,
    })),
  }))
}

function matchGroups(matches: Match[], label: (m: Match) => string): RoundGroup[] {
  const done = matches.filter((m) => (m.status === 'done' || m.status === 'forfeit') && m.teamA && m.teamB && m.winner)
  const byLabel = new Map<string, GameLine[]>()
  for (const m of done) {
    const l = label(m)
    const list = byLabel.get(l) ?? []
    list.push({
      key: m.id,
      courtId: m.courtId,
      a: m.teamA!,
      b: m.teamB!,
      scoreA: m.score?.a ?? null,
      scoreB: m.score?.b ?? null,
      winner: m.winner!,
      forfeit: m.status === 'forfeit',
    })
    byLabel.set(l, list)
  }
  return [...byLabel.entries()].map(([l, games]) => ({ label: l, games }))
}

/** Every finished game, newest round first — the paper trail of the day. */
export function ResultsFeed({ tournament, division }: { tournament: Tournament; division: Division }) {
  const [open, setOpen] = useState(true)
  const divMatches = Object.values(tournament.matches).filter((m) => m.divisionId === division.id)

  const groups: RoundGroup[] = [
    ...matchGroups(
      divMatches.filter((m) => m.phase === 'bracket'),
      () => 'Playoff',
    ),
    ...(division.format.kind === 'ladder'
      ? ladderGroups(division).reverse()
      : matchGroups(
          divMatches.filter((m) => m.phase === 'pool'),
          (m) => `Round ${m.roundIndex + 1}`,
        ).reverse()),
  ].filter((g) => g.games.length > 0)

  if (groups.length === 0) return null
  const name = (id: TeamId) => (tournament.teams as Record<TeamId, Team>)[id]?.name ?? id

  return (
    <section className="border-2 border-line">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 font-cond text-sm font-bold uppercase tracking-widest text-text-soft hover:text-text"
      >
        Results · {groups.reduce((n, g) => n + g.games.length, 0)} games
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t-2 border-line bg-white p-4">
          {groups.map((group) => (
            <div key={group.label}>
              <h5 className="font-cond text-xs font-bold uppercase tracking-[0.25em] text-text-soft">{group.label}</h5>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {group.games.map((g) => (
                  <div key={g.key} className="flex items-baseline gap-2 border border-line px-3 py-1.5 text-sm">
                    {g.courtId !== null && (
                      <span className="tabular font-display text-base text-text-soft">{g.courtId}</span>
                    )}
                    <span className={`min-w-0 truncate ${g.winner === 'a' ? 'font-bold text-flame-deep' : 'text-text-soft'}`}>
                      {name(g.a)}
                    </span>
                    <span className="tabular shrink-0 font-display text-base">
                      {g.forfeit ? 'FF' : `${g.scoreA}–${g.scoreB}`}
                    </span>
                    <span className={`min-w-0 truncate ${g.winner === 'b' ? 'font-bold text-flame-deep' : 'text-text-soft'}`}>
                      {name(g.b)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
