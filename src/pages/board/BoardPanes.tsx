import { Trophy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BracketView } from '../../components/BracketView'
import { ladderStandings } from '../../engine/ladder'
import { poolStandings } from '../../engine/pools'
import { ladderPlayoffPlacement } from '../../store/store'
import type { Division, Match, StandingRow, Team, TeamId, Tournament } from '../../types/tournament'
import { useCountdown, useWhistle } from '../../utils/useCountdown'

/** Rotates 0..pages-1 on a fixed cadence — how the board fits 35 teams on one TV. */
function usePager(pages: number, intervalMs = 10_000): number {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (pages <= 1) return
    const id = setInterval(() => setI((n) => n + 1), intervalMs)
    return () => clearInterval(id)
  }, [pages, intervalMs])
  return pages <= 1 ? 0 : i % pages
}

export function JumboCountdown({ division, offsetMs }: { division: Division; offsetMs: number }) {
  if (division.format.kind !== 'ladder') return null
  return <JumboClock label={`Round ${division.format.state.roundIndex + 1} · ${division.name}`} division={division} offsetMs={offsetMs} />
}

function JumboClock({ label, division, offsetMs }: { label: string; division: Division; offsetMs: number }) {
  const timer = division.format.kind === 'ladder' ? division.format.state.timer : null
  const cd = useCountdown(timer!, offsetMs)
  useWhistle(cd.expired)
  const urgent = cd.seconds <= 60
  return (
    <div className={`relative overflow-hidden border-y-2 border-ink-3 ${cd.expired ? 'animate-pulse' : ''}`}>
      <div
        className={`absolute inset-y-0 left-0 ${urgent ? 'bg-flame-deep/40' : 'bg-ink-2'}`}
        style={{ width: `${Math.min(100, cd.progress * 100)}%` }}
      />
      <div className="relative flex items-center justify-between gap-8 px-10 py-2">
        <span className="font-cond text-3xl font-semibold uppercase tracking-[0.2em] text-board-soft">
          {cd.expired ? 'Time — finish the rally' : label}
        </span>
        <span className={`tabular font-display text-[9rem] leading-none ${urgent ? 'text-flame' : 'text-board-text'}`}>
          {cd.display}
        </span>
      </div>
    </div>
  )
}

export function CourtMap({ tournament }: { tournament: Tournament }) {
  const courts = Array.from({ length: tournament.courtsTotal }, (_, i) => i + 1)
  const playing = new Map<number, Match>()
  for (const m of Object.values(tournament.matches)) {
    if (m.status === 'playing' && m.courtId !== null) playing.set(m.courtId, m)
  }
  const divName = new Map(tournament.divisions.map((d) => [d.id, d.name]))

  return (
    <div className="grid grid-cols-2 gap-3">
      {courts.map((c) => {
        const m = playing.get(c)
        return (
          <div key={c} className={`flex items-center gap-5 border px-5 py-4 ${m ? 'border-ink-3 bg-ink-2' : 'border-ink-2'}`}>
            <span className={`tabular font-display text-6xl leading-none ${m ? 'text-flame' : 'text-ink-3'}`}>{c}</span>
            {m ? (
              <div className="min-w-0">
                <p className="truncate font-cond text-3xl font-semibold leading-tight text-board-text">
                  {teamName(tournament, m.teamA)}
                </p>
                <p className="truncate font-cond text-3xl font-semibold leading-tight text-board-text">
                  {teamName(tournament, m.teamB)}
                </p>
                <p className="mt-1 font-cond text-sm font-bold uppercase tracking-[0.2em] text-board-soft">
                  {m.phase === 'bracket' ? 'Playoff · ' : ''}
                  {divName.get(m.divisionId)}
                </p>
              </div>
            ) : (
              <span className="font-cond text-2xl uppercase tracking-widest text-board-soft/50">Open</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

const teamName = (t: Tournament, id: TeamId | null) => (id ? (t.teams[id]?.name ?? '—') : 'TBD')

/** Rows per standings page — sized so two division panes fit 1080p with the court map. */
const PAGE_SIZE = 6

export function DivisionPane({ tournament, division }: { tournament: Tournament; division: Division }) {
  const champion = championOf(tournament, division)
  const bracket =
    division.format.kind === 'pools'
      ? division.format.state.playoff
      : division.format.kind === 'ladder'
        ? division.format.state.playoff?.bracket
        : null

  const rows = standingsOf(tournament, division)
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE)) + (bracket && !champion ? 1 : 0)
  const page = usePager(pages)
  const showBracket = bracket && !champion && page === pages - 1

  return (
    <section className="flex min-h-0 flex-col border border-ink-2">
      <header className="flex items-baseline justify-between bg-ink-2 px-5 py-2">
        <h3 className="font-display text-3xl uppercase text-board-text">{division.name}</h3>
        <span className="font-cond text-sm font-bold uppercase tracking-[0.2em] text-board-soft">
          {champion ? 'Final' : showBracket ? 'Playoff bracket' : paneLabel(division)}
        </span>
      </header>
      <div className="flex-1 p-4">
        {champion ? (
          <ChampionCard team={champion} rows={rows} teams={tournament.teams} />
        ) : showBracket && bracket ? (
          <BracketView bracket={bracket} matches={tournament.matches} teams={tournament.teams} compact />
        ) : (
          <BoardStandings rows={rows} teams={tournament.teams} page={page % Math.max(1, Math.ceil(rows.length / PAGE_SIZE))} />
        )}
      </div>
      {division.format.kind === 'ladder' &&
        division.format.state.roundPhase === 'playing' &&
        division.format.state.currentSitters.length > 0 &&
        !champion && (
          <p className="truncate border-t border-ink-2 px-5 py-2 font-cond text-lg text-board-soft">
            <span className="font-bold uppercase tracking-wider">Sitting · </span>
            {division.format.state.currentSitters.map((id) => tournament.teams[id]?.name).join(' · ')}
          </p>
        )}
    </section>
  )
}

function paneLabel(division: Division): string {
  if (division.format.kind === 'ladder') return `Ladder · round ${division.format.state.roundIndex + (division.format.state.roundPhase === 'playing' ? 1 : 0) || 'up next'}`
  if (division.format.kind === 'pools') return division.format.state.phase === 'pool' ? 'Pool play' : 'Playoff'
  return ''
}

function standingsOf(tournament: Tournament, division: Division): StandingRow[] {
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

function championOf(tournament: Tournament, division: Division): Team | null {
  const id =
    division.format.kind === 'pools'
      ? division.format.state.playoff?.championId
      : division.format.kind === 'ladder'
        ? division.format.state.playoff?.bracket?.championId
        : null
  return id ? (tournament.teams[id] ?? null) : null
}

function BoardStandings({ rows, teams, page }: { rows: StandingRow[]; teams: Record<TeamId, Team>; page: number }) {
  const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  return (
    <table className="w-full">
      <tbody>
        {slice.map((row) => (
          <tr key={row.teamId} className="border-b border-ink-2 last:border-0">
            <td className={`tabular w-12 py-1.5 pr-3 text-right font-display text-2xl ${row.rank === 1 ? 'text-gold' : 'text-board-soft'}`}>
              {row.rank}
            </td>
            <td className="truncate py-1.5 font-cond text-2xl font-semibold text-board-text">
              {teams[row.teamId]?.name}
              {row.note && (
                <span className="ml-3 font-cond text-sm font-bold uppercase tracking-wider text-board-soft/70">{row.note}</span>
              )}
            </td>
            <td className="tabular w-16 py-1.5 text-right font-cond text-2xl text-board-soft">
              {row.w}–{row.l}
            </td>
            <td className={`tabular w-16 py-1.5 text-right font-cond text-2xl ${row.diff > 0 ? 'text-court' : 'text-board-soft/60'}`}>
              {row.diff > 0 ? `+${row.diff}` : row.diff}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ChampionCard({ team, rows, teams }: { team: Team; rows: StandingRow[]; teams: Record<TeamId, Team> }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 py-6 text-center">
      <Trophy className="text-gold" size={56} />
      <p className="font-cond text-xl font-bold uppercase tracking-[0.4em] text-gold">Champions</p>
      <p className="font-display text-6xl uppercase leading-none text-board-text">{team.name}</p>
      <p className="font-cond text-2xl text-board-soft">
        {team.players[0]}
        {team.players[1] ? ` · ${team.players[1]}` : ''}
      </p>
      <div className="mt-2 flex gap-8 font-cond text-xl text-board-soft">
        {rows.slice(1, 4).map((row) => (
          <span key={row.teamId}>
            <span className="tabular font-display text-gold/70">{row.rank}</span> {teams[row.teamId]?.name}
          </span>
        ))}
      </div>
    </div>
  )
}
