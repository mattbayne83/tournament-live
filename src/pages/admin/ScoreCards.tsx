import { Check, Minus, Plus } from 'lucide-react'
import { useAppStore, type ScoreDraft } from '../../store/store'
import type { Match, Team, TeamId } from '../../types/tournament'

/**
 * Courtside score entry. `draft` mode (ladder) accumulates scores that commit
 * together at round finalize; `commit` mode (pools/bracket) confirms each
 * match on the spot and frees the court.
 */
export function ScoreCard({
  match,
  teams,
  mode,
}: {
  match: Match
  teams: Record<TeamId, Team>
  mode: 'draft' | 'commit'
}) {
  const draft = useAppStore((s) => s.ui.scoreDrafts[match.id]) ?? { a: 0, b: 0 }
  const setScoreDraft = useAppStore((s) => s.setScoreDraft)
  const enterMatchScore = useAppStore((s) => s.enterMatchScore)

  const tied = draft.a === draft.b
  const winner: 'a' | 'b' | undefined = draft.a > draft.b ? 'a' : draft.b > draft.a ? 'b' : draft.winner
  const scored = draft.a > 0 || draft.b > 0
  const ready = scored && winner !== undefined

  const update = (changes: Partial<ScoreDraft>) => setScoreDraft(match.id, { ...draft, ...changes })

  const sideRow = (side: 'a' | 'b') => {
    const teamId = side === 'a' ? match.teamA : match.teamB
    const value = draft[side]
    const isWinner = ready && winner === side
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => tied && scored && update({ winner: side })}
          disabled={!tied || !scored}
          className={`min-w-0 flex-1 truncate text-left font-semibold ${
            isWinner ? 'text-flame-deep' : 'text-text'
          } ${tied && scored ? 'underline decoration-dotted underline-offset-4' : ''}`}
          title={tied && scored ? 'tap to mark winner of the tiebreak' : undefined}
        >
          {teamId ? teams[teamId]?.name : 'TBD'}
          {isWinner && <Check className="ml-1 inline text-flame-deep" size={16} strokeWidth={3} />}
        </button>
        <div className="flex items-stretch">
          <button
            aria-label="minus"
            onClick={() => update({ [side]: Math.max(0, value - 1), winner: undefined })}
            className="grid h-12 w-12 place-items-center border-2 border-line text-text-soft active:bg-paper-2"
          >
            <Minus size={18} strokeWidth={3} />
          </button>
          <span className="tabular grid w-14 place-items-center border-y-2 border-line font-display text-2xl">{value}</span>
          <button
            aria-label="plus"
            onClick={() => update({ [side]: value + 1, winner: undefined })}
            className="grid h-12 w-12 place-items-center border-2 border-line text-text active:bg-flame-tint"
          >
            <Plus size={18} strokeWidth={3} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-2 border-line bg-white">
      <div className="flex items-center justify-between bg-ink px-3 py-1.5">
        <span className="font-display text-lg uppercase text-board-text">Court {match.courtId ?? '—'}</span>
        {tied && scored && (
          <span className="font-cond text-xs font-bold uppercase tracking-wider text-gold">tied — tap the winner</span>
        )}
      </div>
      <div className="space-y-2 p-3">
        {sideRow('a')}
        {sideRow('b')}
        {mode === 'commit' && (
          <button
            disabled={!ready}
            onClick={() => winner && enterMatchScore(match.id, { a: draft.a, b: draft.b }, winner)}
            className="mt-1 h-12 w-full bg-flame font-cond text-base font-bold uppercase tracking-widest text-ink transition-colors hover:bg-flame-deep hover:text-paper disabled:opacity-30"
          >
            Confirm result
          </button>
        )}
      </div>
    </div>
  )
}

export function CourtGrid({
  matches,
  teams,
  mode,
}: {
  matches: Match[]
  teams: Record<TeamId, Team>
  mode: 'draft' | 'commit'
}) {
  if (matches.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[...matches]
        .sort((x, y) => (x.courtId ?? 99) - (y.courtId ?? 99))
        .map((m) => (
          <ScoreCard key={m.id} match={m} teams={teams} mode={mode} />
        ))}
    </div>
  )
}

export function UpNextList({ matches, teams }: { matches: Match[]; teams: Record<TeamId, Team> }) {
  const queued = matches.filter((m) => m.status === 'queued' && m.teamA && m.teamB).slice(0, 4)
  if (queued.length === 0) return null
  return (
    <div className="border-2 border-line bg-paper-2 px-4 py-3">
      <p className="font-cond text-xs font-bold uppercase tracking-widest text-text-soft">Up next</p>
      <ul className="mt-1 space-y-0.5 text-sm font-semibold">
        {queued.map((m) => (
          <li key={m.id}>
            {teams[m.teamA!]?.name} <span className="text-text-soft">vs</span> {teams[m.teamB!]?.name}
          </li>
        ))}
      </ul>
    </div>
  )
}
