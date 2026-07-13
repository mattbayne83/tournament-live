import { ArrowRight, Trophy, Upload } from 'lucide-react'
import { useRef } from 'react'
import { useLocation } from 'wouter'
import { Button, Tag } from '../components/ui'
import { importBackup } from '../store/persistence'
import { useAppStore } from '../store/store'

export default function Home() {
  const [, navigate] = useLocation()
  const tournament = useAppStore((s) => s.tournament)
  const createTournament = useAppStore((s) => s.createTournament)
  const loadTournament = useAppStore((s) => s.loadTournament)
  const fileRef = useRef<HTMLInputElement>(null)

  const onImport = async (file: File) => {
    try {
      const { tournament: imported, adminKey } = importBackup(await file.text())
      loadTournament(imported, adminKey)
      navigate(imported.status === 'setup' ? '/setup' : '/admin')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not read that file')
    }
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
                <Tag tone={tournament.status === 'live' ? 'flame' : 'uw'}>{tournament.status}</Tag>
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
              if (tournament && !confirm('Start a new tournament? The current one stays saved on this device.')) return
              createTournament('New Tournament', 8)
              navigate('/setup')
            }}
          >
            <Trophy size={20} /> New tournament
          </Button>
          <Button size="lg" variant="secondary" onClick={() => fileRef.current?.click()}>
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
      </div>

      <p className="mt-16 max-w-md text-sm leading-relaxed text-text-soft">
        Run ladder or pool-play tournaments from one device — live TV board, court assignments, round countdowns, and
        standings that update as you score.
      </p>
    </div>
  )
}
