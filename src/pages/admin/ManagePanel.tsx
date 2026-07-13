import { ChevronDown, UserMinus } from 'lucide-react'
import { useState } from 'react'
import { QrCode } from '../../components/QrCode'
import { Button, Stepper } from '../../components/ui'
import { useAppStore } from '../../store/store'
import type { Division, LadderRoundRecord, MatchResult, Tournament } from '../../types/tournament'

/** Desk-side controls that don't belong in the courtside flow. */
export function ManagePanel({ tournament, division }: { tournament: Tournament; division: Division }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="border-2 border-line">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-2.5 font-cond text-sm font-bold uppercase tracking-widest text-text-soft hover:text-text"
      >
        Manage {division.name}
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-6 border-t-2 border-line bg-white p-4">
          <ShareBlock tournament={tournament} />
          <CourtsBlock tournament={tournament} division={division} />
          {division.format.kind === 'ladder' && <LadderConfigBlock division={division} />}
          <TeamsBlock tournament={tournament} division={division} />
          {division.format.kind === 'ladder' && <HistoryBlock tournament={tournament} division={division} />}
        </div>
      )}
    </section>
  )
}

function BlockLabel({ children }: { children: string }) {
  return <h4 className="font-cond text-xs font-bold uppercase tracking-[0.25em] text-text-soft">{children}</h4>
}

function ShareBlock({ tournament }: { tournament: Tournament }) {
  const adminKey = useAppStore((s) => s.adminKey)
  const url = `${location.origin}/t/${tournament.id}`
  return (
    <div>
      <BlockLabel>Share</BlockLabel>
      <div className="mt-2 flex items-center gap-4">
        <QrCode value={url} size={104} />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Spectator link (scan or copy)</p>
          <code className="block truncate text-text-soft">{url}</code>
          <p className="mt-2 font-semibold">TV board on another device</p>
          <code className="block truncate text-text-soft">{url}/board</code>
          {adminKey && (
            <p className="mt-2 text-text-soft">
              Admin key: <code>{adminKey}</code>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function CourtsBlock({ tournament, division }: { tournament: Tournament; division: Division }) {
  const updateDivisionCourts = useAppStore((s) => s.updateDivisionCourts)
  const [error, setError] = useState<string | null>(null)
  const allCourts = Array.from({ length: tournament.courtsTotal }, (_, i) => i + 1)
  const apply = (courts: number[]) => {
    setError(null)
    try {
      updateDivisionCourts(division.id, courts)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not change courts')
    }
  }
  return (
    <div>
      <BlockLabel>Courts</BlockLabel>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {allCourts.map((c) => {
          const on = division.courtIds.includes(c)
          return (
            <button
              key={c}
              onClick={() => apply(on ? division.courtIds.filter((x) => x !== c) : [...division.courtIds, c])}
              className={`tabular h-10 w-10 border-2 font-display ${
                on ? 'border-ink bg-ink text-board-text' : 'border-line text-text-soft hover:border-ink-3'
              }`}
            >
              {c}
            </button>
          )
        })}
        <Button size="sm" variant="ghost" onClick={() => apply(allCourts)}>
          Take all courts
        </Button>
      </div>
      <p className="mt-1.5 text-sm text-text-soft">
        The time-block handoff: when the other division wraps, tap “take all courts” here. Changes apply from the next round.
      </p>
      {error && <p className="mt-1 font-semibold text-flame-deep">{error}</p>}
    </div>
  )
}

function LadderConfigBlock({ division }: { division: Division }) {
  const updateLadderConfig = useAppStore((s) => s.updateLadderConfig)
  if (division.format.kind !== 'ladder') return null
  return (
    <div>
      <BlockLabel>Round length</BlockLabel>
      <div className="mt-2 flex items-center gap-3">
        <Stepper
          value={division.format.config.roundMinutes}
          min={6}
          max={20}
          format={(n) => `${n}m`}
          onChange={(n) => updateLadderConfig(division.id, { roundMinutes: n })}
        />
        <span className="text-sm text-text-soft">applies from the next round</span>
      </div>
    </div>
  )
}

function TeamsBlock({ tournament, division }: { tournament: Tournament; division: Division }) {
  const withdrawTeam = useAppStore((s) => s.withdrawTeam)
  const teams = Object.values(tournament.teams).filter((t) => t.divisionId === division.id)
  return (
    <div>
      <BlockLabel>Teams</BlockLabel>
      <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
        {teams.map((team) => (
          <li key={team.id} className="flex items-center justify-between gap-2 border-b border-paper-2 py-1 text-sm">
            <span className={team.status === 'withdrawn' ? 'text-text-soft line-through' : 'font-semibold'}>
              {team.name}
            </span>
            {team.status === 'active' && (
              <button
                onClick={() => {
                  if (confirm(`Withdraw ${team.name}? Remaining games become forfeits.`)) withdrawTeam(team.id)
                }}
                aria-label={`withdraw ${team.name}`}
                title="Withdraw"
                className="p-1.5 text-text-soft hover:text-flame-deep"
              >
                <UserMinus size={15} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function HistoryBlock({ tournament, division }: { tournament: Tournament; division: Division }) {
  const [editing, setEditing] = useState<LadderRoundRecord | null>(null)
  if (division.format.kind !== 'ladder') return null
  const history = division.format.state.history
  if (history.length === 0) return null
  const name = (id: string) => tournament.teams[id]?.name ?? id

  return (
    <div>
      <BlockLabel>Round history</BlockLabel>
      <ul className="mt-2 space-y-1">
        {history.map((record) => (
          <li key={record.roundIndex} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-cond font-bold uppercase tracking-wider text-text-soft">Round {record.roundIndex + 1}</span>
            <span className="min-w-0 flex-1 truncate text-text-soft">
              {record.results
                .map((r) => `${name(r.winner === 'a' ? r.a : r.b)} def. ${name(r.winner === 'a' ? r.b : r.a)} ${r.score.a}–${r.score.b}`)
                .join(' · ')}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setEditing(structuredClone(record))}>
              Edit
            </Button>
          </li>
        ))}
      </ul>
      {editing && (
        <RoundEditor
          record={editing}
          division={division}
          nameOf={name}
          onChange={setEditing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function RoundEditor({
  record,
  division,
  nameOf,
  onChange,
  onClose,
}: {
  record: LadderRoundRecord
  division: Division
  nameOf: (id: string) => string
  onChange: (r: LadderRoundRecord) => void
  onClose: () => void
}) {
  const correctLadderRound = useAppStore((s) => s.correctLadderRound)
  const [error, setError] = useState<string | null>(null)
  const playoffLocked = division.format.kind === 'ladder' && division.format.state.playoff !== null

  const setResult = (i: number, changes: Partial<MatchResult>) => {
    const results = record.results.map((r, j) => (j === i ? { ...r, ...changes } : r))
    onChange({ ...record, results })
  }

  const save = (mode: 'stats' | 'replay') => {
    setError(null)
    try {
      correctLadderRound(division.id, record.roundIndex, record.results, mode)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save correction')
    }
  }

  return (
    <div className="mt-3 space-y-3 border-2 border-ink bg-paper-2 p-4">
      <p className="font-cond font-bold uppercase tracking-widest">Correct round {record.roundIndex + 1}</p>
      {record.results.map((r, i) => (
        <div key={r.matchId} className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-cond font-bold uppercase text-text-soft">Court {r.courtId}</span>
          {(['a', 'b'] as const).map((side) => (
            <label key={side} className="flex items-center gap-1.5">
              <button
                onClick={() => setResult(i, { winner: side })}
                className={`px-2 py-0.5 font-semibold ${r.winner === side ? 'bg-ink text-board-text' : 'bg-white text-text-soft'}`}
              >
                {nameOf(r[side])}
              </button>
              <input
                type="number"
                min={0}
                value={r.score[side]}
                onChange={(e) => setResult(i, { score: { ...r.score, [side]: Math.max(0, Number(e.target.value)) } })}
                className="tabular w-14 border-2 border-line bg-white px-1 py-0.5 text-right"
              />
            </label>
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button size="sm" onClick={() => save('stats')}>
          Fix stats only
        </Button>
        <Button size="sm" variant="secondary" disabled={playoffLocked} onClick={() => {
          if (confirm('Replay positions from this round forward? Teams may jump courts relative to where they physically played.')) save('replay')
        }}>
          Replay positions
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="text-xs text-text-soft">
          “Fix stats only” keeps everyone where they played (recommended){playoffLocked ? ' · replay locked after playoff extraction' : ''}
        </span>
      </div>
      {error && <p className="font-semibold text-flame-deep">{error}</p>}
    </div>
  )
}
