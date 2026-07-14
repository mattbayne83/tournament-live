import { Download, Home, MonitorPlay, RotateCcw, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { StandingsTable } from '../../components/StandingsTable'
import { SyncPill } from '../../components/SyncPill'
import { TimerBar } from '../../components/TimerBar'
import { Button, ConfirmDialog, Tag } from '../../components/ui'
import { ladderStandings } from '../../engine/ladder'
import { poolStandings } from '../../engine/pools'
import { exportBackup } from '../../store/persistence'
import { ladderPlayoffPlacement, useAppStore } from '../../store/store'
import type { CourtId, Division, Tournament } from '../../types/tournament'
import { LadderViz } from './LadderViz'
import { ManagePanel } from './ManagePanel'
import { PlayoffStrip } from './PlayoffStrip'
import { ResultsFeed } from './ResultsFeed'
import { RoundControls } from './RoundControls'
import { CourtGrid, UpNextList } from './ScoreCards'

export default function AdminDashboard() {
  const [, navigate] = useLocation()
  const tournament = useAppStore((s) => s.tournament)
  const adminKey = useAppStore((s) => s.adminKey)
  const past = useAppStore((s) => s.past)
  const undo = useAppStore((s) => s.undo)
  const endTournament = useAppStore((s) => s.endTournament)
  const resetTournament = useAppStore((s) => s.resetTournament)
  const activeDivisionId = useAppStore((s) => s.ui.activeDivisionId)
  const setActiveDivision = useAppStore((s) => s.setActiveDivision)
  const twoTabs = useSecondAdminTabGuard()
  const [confirm, setConfirm] = useState<'end' | 'reset' | null>(null)

  // The scoring device must not doze off courtside.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    navigator.wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    return () => void lock?.release().catch(() => {})
  }, [])

  if (!tournament) {
    navigate('/')
    return null
  }
  if (tournament.status === 'setup') {
    navigate('/setup')
    return null
  }

  const active =
    tournament.divisions.find((d) => d.id === activeDivisionId) ?? tournament.divisions[0]
  const lastUndo = past[past.length - 1]

  const download = () => {
    const blob = new Blob([exportBackup(tournament, adminKey)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${tournament.name.replaceAll(/\W+/g, '-').toLowerCase()}-backup.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-20 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="p-2 text-text-soft hover:text-text" aria-label="home">
          <Home size={20} />
        </Link>
        <h1 className="font-display text-3xl uppercase leading-none">{tournament.name}</h1>
        <Tag tone="flame">{tournament.status}</Tag>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <SyncPill />
          <Button size="sm" variant="ghost" onClick={download} title="Download backup JSON">
            <Download size={16} /> Backup
          </Button>
          <Button size="sm" variant="ghost" disabled={!lastUndo} onClick={undo} title={lastUndo?.label}>
            <Undo2 size={16} /> {lastUndo ? `Undo: ${lastUndo.label}` : 'Undo'}
          </Button>
          <Link href="/board">
            <Button size="sm" variant="secondary">
              <MonitorPlay size={16} /> TV board
            </Button>
          </Link>
        </div>
      </header>

      {twoTabs && (
        <p className="mt-4 border-2 border-flame-deep bg-flame-tint px-4 py-3 font-semibold text-flame-deep">
          Another admin tab is open. Scoring from two tabs will overwrite each other — close one.
        </p>
      )}

      {tournament.status === 'complete' && (
        <p className="mt-4 border-2 border-gold bg-gold/20 px-4 py-3 font-semibold text-ink">
          Tournament complete. Scores are locked — use Reset to setup for another dry run.
        </p>
      )}

      <nav className="mt-6 flex flex-wrap gap-1 border-b-2 border-line">
        {tournament.divisions.map((div) => (
          <button
            key={div.id}
            onClick={() => setActiveDivision(div.id)}
            className={`-mb-0.5 px-5 py-2.5 font-cond text-base font-bold uppercase tracking-widest ${
              div.id === active?.id
                ? 'border-b-4 border-flame text-text'
                : 'border-b-4 border-transparent text-text-soft hover:text-text'
            }`}
          >
            {div.name}
            {div.status === 'complete' && ' ✓'}
          </button>
        ))}
      </nav>

      {active && (
        <main className="mt-6">
          {active.format.kind === 'ladder' ? (
            <LadderPanel tournament={tournament} division={active} />
          ) : (
            <PoolsPanel tournament={tournament} division={active} />
          )}

          <section className="mt-8 flex flex-wrap gap-3 border-t-2 border-line pt-6">
            {tournament.status === 'live' && (
              <Button variant="secondary" onClick={() => setConfirm('end')}>
                End tournament
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConfirm('reset')}>
              <RotateCcw size={16} /> Reset to setup
            </Button>
          </section>
        </main>
      )}

      <ConfirmDialog
        open={confirm === 'end'}
        title="End this tournament?"
        body={
          <>
            Marks <strong className="text-text">{tournament.name}</strong> and every division as complete. Use this when
            the day is finished (or you want a clean stop mid dry-run). Scoring and round controls stop.
          </>
        }
        confirmLabel="End tournament"
        danger
        onConfirm={() => {
          endTournament()
          setConfirm(null)
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset tournament to setup?"
        body={
          <>
            Clears all scores, matches, timers, and playoff state for{' '}
            <strong className="text-text">{tournament.name}</strong>. Teams, formats, and courts stay. You&apos;ll return
            to the setup wizard and need to Go live again.
          </>
        }
        confirmLabel="Reset tournament"
        danger
        onConfirm={() => {
          resetTournament()
          setConfirm(null)
          navigate('/setup')
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

/** Two admin tabs both publish full state — last write silently wins. Warn loudly. */
function useSecondAdminTabGuard(): boolean {
  const [twoTabs, setTwoTabs] = useState(false)
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const channel = new BroadcastChannel('pbt-admin')
    channel.onmessage = (e) => {
      if (e.data === 'admin-here') {
        setTwoTabs(true)
        channel.postMessage('admin-here-too')
      }
      if (e.data === 'admin-here-too') setTwoTabs(true)
    }
    channel.postMessage('admin-here')
    return () => channel.close()
  }, [])
  return twoTabs
}

function LadderPanel({ tournament, division }: { tournament: Tournament; division: Division }) {
  const { timerPause, timerResume } = useAppStore()
  if (division.format.kind !== 'ladder') return null
  const state = division.format.state
  const playingMatches = state.currentMatchIds.map((id) => tournament.matches[id]).filter(Boolean)
  const standings = ladderStandings(state, ladderPlayoffPlacement(tournament, division))

  return (
    <div className="space-y-6">
      {state.roundPhase === 'playing' && (
        <TimerBar
          timer={state.timer}
          label={`Round ${state.roundIndex + 1} · ${division.name}`}
          onPause={() => timerPause(division.id)}
          onResume={() => timerResume(division.id)}
        />
      )}

      <RoundControls tournament={tournament} division={division} />

      {playingMatches.length > 0 && <CourtGrid matches={playingMatches} teams={tournament.teams} mode="draft" />}

      {state.playoff?.bracket && (
        <PlayoffStrip bracket={state.playoff.bracket} matches={tournament.matches} teams={tournament.teams} />
      )}

      {state.roundPhase === 'idle' && !state.playoff && state.roundIndex >= 1 && (
        <ExtractPlayoffControl tournament={tournament} division={division} />
      )}

      <LadderViz tournament={tournament} division={division} />

      <StandingsTable rows={standings} teams={tournament.teams} title="Ladder standings" />
      <ResultsFeed tournament={tournament} division={division} />
      <ManagePanel tournament={tournament} division={division} />
    </div>
  )
}

/** The hybrid finish: pull the top 4 onto a championship court while the ladder plays on. */
function ExtractPlayoffControl({ tournament, division }: { tournament: Tournament; division: Division }) {
  const ladderExtractPlayoff = useAppStore((s) => s.ladderExtractPlayoff)
  const [open, setOpen] = useState(false)
  const [court, setCourt] = useState<CourtId>(division.courtIds[0])
  const [error, setError] = useState<string | null>(null)
  if (division.format.kind !== 'ladder') return null
  const topN = division.format.config.playoffTopN
  const top = division.format.state.order.slice(0, topN)
  if (division.format.state.order.length < topN + 2) return null

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Send top {topN} to playoff…
      </Button>
    )
  }
  return (
    <div className="space-y-3 border-2 border-ink bg-ink p-5 text-board-text">
      <p className="font-cond font-semibold uppercase tracking-[0.25em] text-board-soft">Playoff extraction</p>
      <p className="text-sm text-board-soft">
        Semifinals: <span className="font-semibold text-board-text">{tournament.teams[top[0]]?.name}</span> vs{' '}
        <span className="font-semibold text-board-text">{tournament.teams[top[3]]?.name}</span> ·{' '}
        <span className="font-semibold text-board-text">{tournament.teams[top[1]]?.name}</span> vs{' '}
        <span className="font-semibold text-board-text">{tournament.teams[top[2]]?.name}</span>. The rest of the ladder
        keeps playing on the remaining courts.
      </p>
      <label className="flex items-center gap-3 font-cond text-sm font-bold uppercase tracking-wider text-board-soft">
        Championship court
        <select
          value={court}
          onChange={(e) => setCourt(Number(e.target.value))}
          className="border-2 border-ink-3 bg-ink-2 px-2 py-1 font-display text-lg text-board-text"
        >
          {division.courtIds.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        <Button
          onClick={() => {
            setError(null)
            try {
              ladderExtractPlayoff(division.id, court)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'could not extract playoff')
            }
          }}
        >
          Start the playoff
        </Button>
        <Button variant="ghost" className="text-board-soft hover:bg-ink-2 hover:text-board-text" onClick={() => setOpen(false)}>
          Not yet
        </Button>
      </div>
      {error && <p className="font-semibold text-flame">{error}</p>}
    </div>
  )
}

function PoolsPanel({ tournament, division }: { tournament: Tournament; division: Division }) {
  const { assignCourts, poolsStartPlayoff } = useAppStore()
  if (division.format.kind !== 'pools') return null
  const state = division.format.state
  const cfg = division.format.config
  const divMatches = Object.values(tournament.matches).filter((m) => m.divisionId === division.id)
  const poolMatches = divMatches.filter((m) => m.phase === 'pool')
  const playing = divMatches.filter((m) => m.status === 'playing')
  const doneCount = poolMatches.filter((m) => m.status === 'done' || m.status === 'forfeit').length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="tabular font-display text-2xl uppercase">
          {doneCount}<span className="text-text-soft">/{poolMatches.length}</span>
        </span>
        <span className="font-cond font-semibold uppercase tracking-wider text-text-soft">pool games played</span>
        {playing.length === 0 && state.phase === 'pool' && doneCount < poolMatches.length && (
          <Button size="sm" variant="secondary" onClick={() => assignCourts(division.id)}>
            Fill courts
          </Button>
        )}
        {state.phase === 'pool' && (
          <Button
            size="sm"
            disabled={doneCount === 0}
            onClick={() => {
              if (
                doneCount < poolMatches.length &&
                !confirm(`${poolMatches.length - doneCount} pool games unplayed — seed the playoff from current standings anyway?`)
              )
                return
              poolsStartPlayoff(division.id)
            }}
          >
            Start playoff · top {cfg.playoffTeamCount}
          </Button>
        )}
      </div>

      {playing.length > 0 && <CourtGrid matches={playing} teams={tournament.teams} mode="commit" />}

      <UpNextList matches={divMatches.filter((m) => m.phase === 'pool')} teams={tournament.teams} />

      {state.playoff && <PlayoffStrip bracket={state.playoff} matches={tournament.matches} teams={tournament.teams} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {state.pools.map((pool) => (
          <StandingsTable
            key={pool.id}
            rows={poolStandings(pool, divMatches, cfg.rngSeed)}
            teams={tournament.teams}
            title={pool.name}
          />
        ))}
      </div>

      <ResultsFeed tournament={tournament} division={division} />
      <ManagePanel tournament={tournament} division={division} />
    </div>
  )
}
