import { ArrowRight, CalendarClock, FlaskConical, RotateCcw, Trophy, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { Button, ConfirmDialog, Tag } from '../components/ui'
import { importBackup } from '../store/persistence'
import { useAppStore } from '../store/store'

export default function Home() {
  const [, navigate] = useLocation()
  const tournament = useAppStore((s) => s.tournament)
  const createTournament = useAppStore((s) => s.createTournament)
  const loadDemoTournament = useAppStore((s) => s.loadDemoTournament)
  const loadTournament = useAppStore((s) => s.loadTournament)
  const resetTournament = useAppStore((s) => s.resetTournament)
  const endTournament = useAppStore((s) => s.endTournament)
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<'demo' | 'reset' | 'end' | null>(null)

  const onImport = async (file: File) => {
    try {
      const { tournament: imported, adminKey } = importBackup(await file.text())
      loadTournament(imported, adminKey)
      navigate(imported.status === 'setup' ? '/setup' : '/admin')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read that file')
    }
  }

  const runDemo = () => {
    loadDemoTournament()
    setConfirm(null)
    navigate('/setup')
  }

  const runReset = () => {
    resetTournament()
    setConfirm(null)
    navigate('/setup')
  }

  const runEnd = () => {
    try {
      endTournament()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not end tournament')
    }
    setConfirm(null)
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="font-cond font-semibold uppercase tracking-[0.3em] text-flame-deep">Tournament day HQ</p>
      <h1 className="mt-2 font-display text-6xl uppercase leading-none text-text sm:text-7xl">
        Tournament
        <br />
        Manager
      </h1>

      <div className="mt-12 space-y-4">
        {tournament && (
          <button
            onClick={() => navigate(tournament.status === 'setup' ? '/setup' : '/admin')}
            className="group flex w-full items-center justify-between border-2 border-ink bg-ink px-6 py-5 text-left transition-colors hover:bg-ink-2"
          >
            <span>
              <span className="flex items-center gap-3">
                <span className="font-display text-2xl uppercase text-board-text">{tournament.name}</span>
                <Tag tone={tournament.status === 'live' ? 'flame' : tournament.status === 'complete' ? 'gold' : 'uw'}>
                  {tournament.status}
                </Tag>
              </span>
              <span className="mt-1 block text-sm text-board-soft">
                {tournament.divisions.length} division{tournament.divisions.length === 1 ? '' : 's'} ·{' '}
                {Object.keys(tournament.teams).length} teams · {tournament.courtsTotal} courts
              </span>
            </span>
            <ArrowRight className="text-flame transition-transform group-hover:translate-x-1" />
          </button>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            size="lg"
            onClick={() => {
              if (tournament && !window.confirm('Start a new tournament? The current one stays saved on this device.'))
                return
              createTournament('New Tournament', 8)
              navigate('/setup')
            }}
          >
            <Trophy size={20} /> New tournament
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              if (tournament) setConfirm('demo')
              else runDemo()
            }}
          >
            <FlaskConical size={20} /> Load demo
          </Button>
          <Button size="lg" variant="secondary" onClick={() => navigate('/plan')}>
            <CalendarClock size={20} /> Day planner
          </Button>
          <Button size="lg" variant="ghost" onClick={() => fileRef.current?.click()}>
            <Upload size={20} /> Import backup
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ''
            }}
          />
        </div>

        {tournament && tournament.status !== 'setup' && (
          <div className="flex flex-wrap gap-3 border-t-2 border-line pt-4">
            {tournament.status === 'live' && (
              <Button size="md" variant="secondary" onClick={() => setConfirm('end')}>
                End tournament
              </Button>
            )}
            <Button size="md" variant="ghost" onClick={() => setConfirm('reset')}>
              <RotateCcw size={16} /> Reset to setup
            </Button>
          </div>
        )}
      </div>

      <p className="mt-16 max-w-md text-sm leading-relaxed text-text-soft">
        Run ladder or pool-play tournaments from one device — live TV board, court assignments, round countdowns, and
        standings that update as you score. Use <span className="font-semibold text-text">Load demo</span> for a
        one-click test event with sample teams.
      </p>

      <ConfirmDialog
        open={confirm === 'demo'}
        title="Replace current tournament?"
        body="Loading the demo creates a new Competitive ladder + Recreational pools event with sample teams. Your current tournament stays in this browser’s storage under its own id, but this session will switch to the demo."
        confirmLabel="Load demo"
        danger
        onConfirm={runDemo}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset tournament to setup?"
        body={
          <>
            This clears all scores, matches, standings progress, and playoff state for{' '}
            <strong className="text-text">{tournament?.name}</strong>. Teams, division settings, and court assignments
            stay. You’ll need to Go live again.
          </>
        }
        confirmLabel="Reset tournament"
        danger
        onConfirm={runReset}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'end'}
        title="End this tournament?"
        body={
          <>
            Marks <strong className="text-text">{tournament?.name}</strong> and every division as complete. Scoring stops;
            the TV board can show final results. You can still Reset to setup afterward if this was a dry run.
          </>
        }
        confirmLabel="End tournament"
        danger
        onConfirm={runEnd}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
