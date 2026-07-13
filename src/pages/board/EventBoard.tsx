import { Expand, LayoutDashboard } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'wouter'
import { QrCode } from '../../components/QrCode'
import {
  useLocalTournament,
  useRemoteTournament,
  type TournamentSource,
} from '../../utils/useTournamentSource'
import { CourtMap, DivisionPane, JumboCountdown } from './BoardPanes'

/** `/board` — on the organizer laptop, straight from the local store. */
export default function EventBoard() {
  return <BoardView {...useLocalTournament()} />
}

/** `/t/:id/board` — same board anywhere, polling the public mirror. */
export function RemoteBoard() {
  const { id } = useParams<{ id: string }>()
  return <BoardView {...useRemoteTournament(id)} />
}

/**
 * The TV Event Board — the most-seen surface of the event. Runs fullscreen on
 * a laptop driving the center-court TVs; every size is set for 1080p read
 * from the bleachers.
 */
function BoardView({ tournament, offsetMs, source, updatedAgoSec, notFound }: TournamentSource) {

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    navigator.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [])

  if (!tournament) {
    return (
      <div className="grid min-h-screen place-items-center bg-ink text-board-soft">
        <p className="px-6 text-center font-display text-3xl uppercase">
          {notFound ? (
            'Tournament not found — check the link'
          ) : source === 'remote' ? (
            'Connecting…'
          ) : (
            <>
              No tournament on this device — <Link href="/" className="text-flame underline">set one up</Link>
            </>
          )}
        </p>
      </div>
    )
  }

  const runningLadder = tournament.divisions.find(
    (d) => d.format.kind === 'ladder' && d.format.state.roundPhase === 'playing',
  )

  return (
    <div className="flex min-h-screen flex-col bg-ink text-board-text">
      <header className="flex items-center justify-between px-10 py-4">
        <h1 className="font-display text-5xl uppercase leading-none">{tournament.name}</h1>
        <div className="flex items-center gap-4">
          {tournament.status === 'live' && (
            <span className="bg-flame px-3 py-1 font-cond text-lg font-bold uppercase tracking-[0.25em] text-ink">
              Live
            </span>
          )}
          {updatedAgoSec !== null && (
            <span className="tabular font-cond text-sm uppercase tracking-wider text-board-soft">
              updated {updatedAgoSec}s ago
            </span>
          )}
          {source === 'local' && (
            <Link
              href="/admin"
              aria-label="back to admin"
              title="Back to admin"
              className="p-2 text-board-soft hover:text-board-text"
            >
              <LayoutDashboard size={22} />
            </Link>
          )}
          <button
            onClick={() => void document.documentElement.requestFullscreen?.().catch(() => {})}
            aria-label="fullscreen"
            className="p-2 text-board-soft hover:text-board-text"
          >
            <Expand size={22} />
          </button>
        </div>
      </header>

      {runningLadder && <JumboCountdown division={runningLadder} offsetMs={offsetMs} />}

      <main className="grid flex-1 gap-5 p-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="mb-2 font-cond text-sm font-bold uppercase tracking-[0.3em] text-board-soft">Courts</p>
          <CourtMap tournament={tournament} />
        </div>
        <div className="flex flex-col gap-5 lg:col-span-5">
          {tournament.divisions.map((d) => (
            <DivisionPane key={d.id} tournament={tournament} division={d} />
          ))}
          <div className="mt-auto flex items-center justify-end gap-4">
            <p className="text-right font-cond text-lg font-semibold uppercase leading-tight tracking-widest text-board-soft">
              Follow along
              <br />
              on your phone
            </p>
            <QrCode value={`${location.origin}/t/${tournament.id}`} size={110} />
          </div>
        </div>
      </main>
    </div>
  )
}
