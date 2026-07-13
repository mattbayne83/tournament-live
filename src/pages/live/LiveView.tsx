import { useState } from 'react'
import { useParams } from 'wouter'
import { BracketView } from '../../components/BracketView'
import { ladderStandings } from '../../engine/ladder'
import { poolStandings } from '../../engine/pools'
import { ladderPlayoffPlacement } from '../../store/store'
import type { Division, StandingRow, Tournament } from '../../types/tournament'
import { useCountdown } from '../../utils/useCountdown'
import { useRemoteTournament } from '../../utils/useTournamentSource'

/** `/t/:id` — the phone-in-the-bleachers view. Read-only, thumb-scrollable. */
export default function LiveView() {
  const { id } = useParams<{ id: string }>()
  const { tournament, offsetMs, updatedAgoSec, notFound } = useRemoteTournament(id)
  const [activeId, setActiveId] = useState<string | null>(null)

  if (!tournament) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink px-6 text-center text-board-soft">
        <p className="font-display text-2xl uppercase">{notFound ? 'Tournament not found — check the link' : 'Connecting…'}</p>
      </div>
    )
  }

  const active = tournament.divisions.find((d) => d.id === activeId) ?? tournament.divisions[0]
  const runningLadder = tournament.divisions.find(
    (d) => d.format.kind === 'ladder' && d.format.state.roundPhase === 'playing',
  )

  return (
    <div className="min-h-screen bg-ink pb-16 text-board-text">
      <header className="flex items-baseline justify-between gap-3 px-4 pt-5">
        <h1 className="font-display text-2xl uppercase leading-tight">{tournament.name}</h1>
        {updatedAgoSec !== null && (
          <span className="tabular shrink-0 font-cond text-xs uppercase tracking-wider text-board-soft">{updatedAgoSec}s ago</span>
        )}
      </header>

      {runningLadder && runningLadder.format.kind === 'ladder' && (
        <SlimCountdown division={runningLadder} offsetMs={offsetMs} />
      )}

      {tournament.divisions.length > 1 && (
        <nav className="mt-4 flex gap-1 px-4">
          {tournament.divisions.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={`px-4 py-2 font-cond text-sm font-bold uppercase tracking-widest ${
                d.id === active?.id ? 'bg-flame text-ink' : 'bg-ink-2 text-board-soft'
              }`}
            >
              {d.name}
            </button>
          ))}
        </nav>
      )}

      {active && <DivisionSection tournament={tournament} division={active} />}
    </div>
  )
}

function SlimCountdown({ division, offsetMs }: { division: Division; offsetMs: number }) {
  const timer = division.format.kind === 'ladder' ? division.format.state.timer : null
  const cd = useCountdown(timer!, offsetMs)
  return (
    <div className="mt-4 flex items-baseline justify-between bg-ink-2 px-4 py-2">
      <span className="font-cond text-sm font-semibold uppercase tracking-widest text-board-soft">
        Round {division.format.kind === 'ladder' ? division.format.state.roundIndex + 1 : ''} · {division.name}
      </span>
      <span className={`tabular font-display text-4xl leading-none ${cd.seconds <= 60 ? 'text-flame' : 'text-board-text'}`}>
        {cd.display}
      </span>
    </div>
  )
}

function DivisionSection({ tournament, division }: { tournament: Tournament; division: Division }) {
  const playing = Object.values(tournament.matches)
    .filter((m) => m.divisionId === division.id && m.status === 'playing')
    .sort((a, b) => (a.courtId ?? 99) - (b.courtId ?? 99))
  const bracket =
    division.format.kind === 'pools'
      ? division.format.state.playoff
      : division.format.kind === 'ladder'
        ? division.format.state.playoff?.bracket
        : null
  const rows = liveStandings(tournament, division)

  return (
    <div className="space-y-6 px-4 pt-5">
      {playing.length > 0 && (
        <section>
          <SectionLabel>On court</SectionLabel>
          <ul className="mt-2 divide-y divide-ink-2 border border-ink-2">
            {playing.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <span className="tabular font-display text-2xl text-flame">{m.courtId}</span>
                <span className="min-w-0 font-cond text-lg font-semibold leading-tight">
                  <span className="block truncate">{m.teamA ? tournament.teams[m.teamA]?.name : 'TBD'}</span>
                  <span className="block truncate">{m.teamB ? tournament.teams[m.teamB]?.name : 'TBD'}</span>
                </span>
                {m.phase === 'bracket' && (
                  <span className="ml-auto font-cond text-xs font-bold uppercase tracking-wider text-gold">playoff</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {bracket && (
        <section>
          <SectionLabel>Playoff</SectionLabel>
          <div className="mt-2">
            <BracketView bracket={bracket} matches={tournament.matches} teams={tournament.teams} compact />
          </div>
        </section>
      )}

      <section>
        <SectionLabel>Standings</SectionLabel>
        <table className="mt-2 w-full">
          <tbody>
            {rows.map((row) => (
              <tr key={row.teamId} className="border-b border-ink-2 last:border-0">
                <td className={`tabular w-8 py-1.5 pr-2 text-right font-display ${row.rank === 1 ? 'text-gold' : 'text-board-soft'}`}>
                  {row.rank}
                </td>
                <td className="truncate py-1.5 font-cond text-base font-semibold">
                  {tournament.teams[row.teamId]?.name}
                  {row.note && <span className="ml-2 text-xs uppercase text-board-soft/70">{row.note}</span>}
                </td>
                <td className="tabular w-12 py-1.5 text-right font-cond text-board-soft">
                  {row.w}–{row.l}
                </td>
                <td className={`tabular w-12 py-1.5 text-right font-cond ${row.diff > 0 ? 'text-court' : 'text-board-soft/60'}`}>
                  {row.diff > 0 ? `+${row.diff}` : row.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function liveStandings(tournament: Tournament, division: Division): StandingRow[] {
  if (division.format.kind === 'ladder') {
    return ladderStandings(division.format.state, ladderPlayoffPlacement(tournament, division))
  }
  if (division.format.kind === 'pools') {
    const divMatches = Object.values(tournament.matches).filter((m) => m.divisionId === division.id)
    const cfg = division.format.config
    return division.format.state.pools.flatMap((pool) =>
      poolStandings(pool, divMatches, cfg.rngSeed).map((row) => ({ ...row, note: pool.name })),
    )
  }
  return []
}

function SectionLabel({ children }: { children: string }) {
  return <h2 className="font-cond text-xs font-bold uppercase tracking-[0.3em] text-board-soft">{children}</h2>
}
