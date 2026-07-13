import { ArrowDown, ArrowUp, Flag, Play } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../components/ui'
import { ladderCourts, useAppStore, type ScoreDraft } from '../../store/store'
import type { Division, Match, MatchId, MatchResult, Team, TeamId, Tournament } from '../../types/tournament'

function gatherResults(
  currentMatchIds: MatchId[],
  matches: Record<MatchId, Match>,
  drafts: Record<MatchId, ScoreDraft>,
): { results: MatchResult[] } | { error: string } {
  const results: MatchResult[] = []
  for (const id of currentMatchIds) {
    const m = matches[id]
    const d = drafts[id]
    if (!d || (d.a === 0 && d.b === 0)) return { error: `Court ${m.courtId}: enter a score` }
    const winner = d.a > d.b ? 'a' : d.b > d.a ? 'b' : d.winner
    if (!winner) return { error: `Court ${m.courtId}: tied — tap the winning team` }
    results.push({ matchId: id, courtId: m.courtId!, a: m.teamA!, b: m.teamB!, score: { a: d.a, b: d.b }, winner })
  }
  return { results }
}

/** Ladder round lifecycle: start → score all courts → preview movement → finalize. */
export function RoundControls({ tournament, division }: { tournament: Tournament; division: Division }) {
  const { ladderStartRound, ladderFinalizeRound, clearScoreDraft } = useAppStore()
  const drafts = useAppStore((s) => s.ui.scoreDrafts)
  const [preview, setPreview] = useState<MatchResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (division.format.kind !== 'ladder') return null
  const state = division.format.state
  const courts = ladderCourts(division)

  if (state.roundPhase === 'idle') {
    const activeTeams = state.order.length
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="lg"
          onClick={() => {
            setError(null)
            try {
              ladderStartRound(division.id)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'could not start round')
            }
          }}
        >
          <Play size={20} /> Start round {state.roundIndex + 1}
        </Button>
        <span className="font-cond font-semibold uppercase tracking-wider text-text-soft">
          {activeTeams} teams · {courts.length} courts · {Math.max(0, activeTeams - courts.length * 2)} will sit
        </span>
        {error && <span className="font-semibold text-flame-deep">{error}</span>}
      </div>
    )
  }

  const attemptPreview = () => {
    const gathered = gatherResults(state.currentMatchIds, tournament.matches, drafts)
    if ('error' in gathered) {
      setError(gathered.error)
      setPreview(null)
    } else {
      setError(null)
      setPreview(gathered.results.sort((x, y) => x.courtId - y.courtId))
    }
  }

  const confirm = () => {
    if (!preview) return
    ladderFinalizeRound(division.id, preview)
    for (const r of preview) clearScoreDraft(r.matchId)
    setPreview(null)
  }

  return (
    <div className="space-y-3">
      {!preview && (
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" variant="secondary" onClick={attemptPreview}>
            <Flag size={20} /> Finalize round {state.roundIndex + 1}
          </Button>
          {error && <span className="font-semibold text-flame-deep">{error}</span>}
        </div>
      )}
      {preview && (
        <MovementPreview
          results={preview}
          teams={tournament.teams}
          courts={courts}
          onConfirm={confirm}
          onCancel={() => setPreview(null)}
        />
      )}
    </div>
  )
}

function MovementPreview({
  results,
  teams,
  courts,
  onConfirm,
  onCancel,
}: {
  results: MatchResult[]
  teams: Record<TeamId, Team>
  courts: number[]
  onConfirm: () => void
  onCancel: () => void
}) {
  const name = (id: TeamId) => teams[id]?.name ?? id
  const last = results.length - 1
  return (
    <div className="border-2 border-ink bg-ink p-5 text-board-text">
      <p className="font-cond font-semibold uppercase tracking-[0.25em] text-board-soft">Movement preview</p>
      <ul className="mt-3 space-y-2">
        {results.map((r, i) => {
          const winner = r.winner === 'a' ? r.a : r.b
          const loser = r.winner === 'a' ? r.b : r.a
          return (
            <li key={r.matchId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-display text-lg uppercase text-board-soft">Court {r.courtId}</span>
              <span className="font-semibold">
                {name(winner)}{' '}
                {i === 0 ? (
                  <span className="text-gold">holds the top court</span>
                ) : (
                  <span className="text-flame">
                    <ArrowUp className="inline" size={14} strokeWidth={3} /> Court {courts[i - 1]}
                  </span>
                )}
              </span>
              <span className="text-board-soft">
                {name(loser)}{' '}
                {i === last ? (
                  'stays'
                ) : (
                  <>
                    <ArrowDown className="inline" size={14} strokeWidth={3} /> Court {courts[i + 1]}
                  </>
                )}
              </span>
              <span className="tabular ml-auto text-board-soft">
                {r.score.a}–{r.score.b}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex gap-3">
        <Button onClick={onConfirm}>Confirm movement</Button>
        <Button variant="ghost" onClick={onCancel} className="text-board-soft hover:bg-ink-2 hover:text-board-text">
          Keep editing
        </Button>
      </div>
    </div>
  )
}
