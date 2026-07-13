import { Download, Home, MonitorPlay, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { StandingsTable } from '../../components/StandingsTable'
import { SyncPill } from '../../components/SyncPill'
import { TimerBar } from '../../components/TimerBar'
import { Button, Tag } from '../../components/ui'
import { ladderStandings } from '../../engine/ladder'
import { poolStandings } from '../../engine/pools'
import { exportBackup } from '../../store/persistence'
import { ladderPlayoffPlacement, useAppStore } from '../../store/store'
import type { Division, Tournament } from '../../types/tournament'
import { PlayoffStrip } from './PlayoffStrip'
import { RoundControls } from './RoundControls'
import { CourtGrid, UpNextList } from './ScoreCards'

export default function AdminDashboard() {
  const [, navigate] = useLocation()
  const tournament = useAppStore((s) => s.tournament)
  const adminKey = useAppStore((s) => s.adminKey)
  const past = useAppStore((s) => s.past)
  const undo = useAppStore((s) => s.undo)
  const activeDivisionId = useAppStore((s) => s.ui.activeDivisionId)
  const setActiveDivision = useAppStore((s) => s.setActiveDivision)
  const twoTabs = useSecondAdminTabGuard()

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
        <div className="ml-auto flex items-center gap-2">
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
        </main>
      )}
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

      {state.currentSitters.length > 0 && state.roundPhase === 'playing' && (
        <p className="text-sm">
          <span className="font-cond font-bold uppercase tracking-widest text-text-soft">Sitting this round · </span>
          <span className="font-semibold">
            {state.currentSitters.map((id) => tournament.teams[id]?.name).join(', ')}
          </span>
        </p>
      )}

      {state.playoff?.bracket && (
        <PlayoffStrip bracket={state.playoff.bracket} matches={tournament.matches} teams={tournament.teams} />
      )}

      <StandingsTable rows={standings} teams={tournament.teams} title="Ladder standings" />
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
    </div>
  )
}
