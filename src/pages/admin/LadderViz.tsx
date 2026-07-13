import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { ladderCourts } from '../../store/store'
import type { Division, LadderRoundRecord, TeamId, Tournament } from '../../types/tournament'

type Move = 'up' | 'down' | 'stay' | 'sat' | null

/** Court a team stood on in a past round record, or null if it sat. */
function courtInRecord(record: LadderRoundRecord | undefined, teamId: TeamId): number | null {
  if (!record) return null
  for (const r of record.results) {
    if (r.a === teamId || r.b === teamId) return r.courtId
  }
  return null
}

/**
 * The ladder as a physical picture: court boxes top to bottom, the teams on
 * (or headed to) each, and how everyone moved after the last round.
 */
export function LadderViz({ tournament, division }: { tournament: Tournament; division: Division }) {
  if (division.format.kind !== 'ladder') return null
  const state = division.format.state
  if (state.history.length === 0 && state.roundPhase === 'idle') return null
  const courts = ladderCourts(division)
  const lastRecord = state.history[state.history.length - 1]
  const name = (id: TeamId) => tournament.teams[id]?.name ?? id

  const playing = state.roundPhase === 'playing'
  const sitterSet = new Set(playing ? state.currentSitters : [])
  const onCourt: Array<{ court: number; teams: [TeamId, TeamId] }> = []
  if (playing) {
    for (const id of state.currentMatchIds) {
      const m = tournament.matches[id]
      if (m?.teamA && m.teamB && m.courtId !== null) onCourt.push({ court: m.courtId, teams: [m.teamA, m.teamB] })
    }
    onCourt.sort((x, y) => x.court - y.court)
  } else {
    // Between rounds: the rank picture — top pairs hold the top courts next.
    for (let i = 0; i * 2 + 1 < state.order.length && i < courts.length; i++) {
      onCourt.push({ court: courts[i], teams: [state.order[i * 2], state.order[i * 2 + 1]] })
    }
  }
  const placed = new Set(onCourt.flatMap((c) => c.teams))
  const waiting = state.order.filter((id) => !placed.has(id))

  const moveOf = (teamId: TeamId, courtNow: number | null): Move => {
    if (!lastRecord) return null
    const prev = courtInRecord(lastRecord, teamId)
    if (prev === null) return lastRecord.sitters.includes(teamId) ? 'sat' : null
    if (courtNow === null) return null
    if (courtNow < prev) return 'up'
    if (courtNow > prev) return 'down'
    return 'stay'
  }

  return (
    <div>
      <h4 className="mb-2 font-display text-lg uppercase text-text-soft">
        The ladder {playing ? `· round ${state.roundIndex + 1} in play` : '· next round layout'}
      </h4>
      <div className="space-y-1.5">
        {onCourt.map(({ court, teams }) => (
          <div key={court} className="flex items-stretch border-2 border-line bg-white">
            <span className="tabular grid w-14 place-items-center bg-ink font-display text-2xl text-board-text">{court}</span>
            <div className="grid flex-1 grid-cols-1 divide-y divide-paper-2 sm:grid-cols-2 sm:divide-x-2 sm:divide-y-0">
              {teams.map((id) => (
                <TeamChip key={id} label={name(id)} move={moveOf(id, court)} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {waiting.length > 0 && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <span className="font-cond font-bold uppercase tracking-widest text-text-soft">
            {playing ? 'Sitting' : 'In rotation'} ·
          </span>
          {waiting.map((id) => (
            <span key={id} className={`font-semibold ${sitterSet.has(id) || !playing ? '' : 'text-text-soft'}`}>
              {name(id)}
              <span className="tabular ml-1 font-cond text-xs text-text-soft">({state.byeCounts[id]} byes)</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function TeamChip({ label, move }: { label: string; move: Move }) {
  return (
    <span className="flex items-center gap-2 px-3 py-1.5 font-semibold">
      {move === 'up' && <ArrowUp size={14} strokeWidth={3} className="shrink-0 text-court" />}
      {move === 'down' && <ArrowDown size={14} strokeWidth={3} className="shrink-0 text-flame-deep" />}
      {move === 'stay' && <Minus size={14} strokeWidth={3} className="shrink-0 text-text-soft/50" />}
      {move === 'sat' && <span className="shrink-0 font-cond text-[10px] font-bold uppercase text-uw-soft">sat</span>}
      <span className="truncate">{label}</span>
    </span>
  )
}
