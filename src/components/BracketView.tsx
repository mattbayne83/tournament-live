import type { BracketState, Match, Team, TeamId } from '../types/tournament'

const roundLabel = (round: number, rounds: number) =>
  round === rounds ? 'Final' : round === rounds - 1 ? 'Semifinals' : round === rounds - 2 ? 'Quarterfinals' : `Round ${round}`

/** Broadcast-dark visual bracket: one column per round, gold for winners. */
export function BracketView({
  bracket,
  matches,
  teams,
  compact = false,
}: {
  bracket: BracketState
  matches: Record<string, Match>
  teams: Record<TeamId, Team>
  compact?: boolean
}) {
  const rounds = Math.log2(bracket.size)
  const byRound = Array.from({ length: rounds }, (_, i) =>
    bracket.slots.filter((s) => s.round === i + 1 && s.id !== '3P'),
  )

  return (
    <div className="flex gap-4 overflow-x-auto">
      {byRound.map((slots, i) => (
        <div key={i} className="flex min-w-44 flex-1 flex-col justify-around gap-3">
          <p className="font-cond text-xs font-bold uppercase tracking-[0.25em] text-board-soft">
            {roundLabel(i + 1, rounds)}
          </p>
          {slots.map((slot) => {
            const m = slot.matchId ? matches[slot.matchId] : null
            return (
              <div key={slot.id} className="border border-ink-3 bg-ink-2">
                {m ? (
                  <>
                    <SlotRow
                      name={m.teamA ? teams[m.teamA]?.name : undefined}
                      score={m.score?.a}
                      won={m.winner === 'a'}
                      live={m.status === 'playing'}
                      compact={compact}
                    />
                    <div className="h-px bg-ink-3" />
                    <SlotRow
                      name={m.teamB ? teams[m.teamB]?.name : undefined}
                      score={m.score?.b}
                      won={m.winner === 'b'}
                      live={m.status === 'playing'}
                      compact={compact}
                    />
                  </>
                ) : (
                  <SlotRow name={byeName(slot.a, slot.b, bracket, teams)} note="bye" compact={compact} />
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function byeName(
  a: BracketState['slots'][number]['a'],
  b: BracketState['slots'][number]['b'],
  bracket: BracketState,
  teams: Record<TeamId, Team>,
): string | undefined {
  for (const src of [a, b]) {
    if (src.type === 'seed' && bracket.seedOrder[src.seed - 1]) {
      return teams[bracket.seedOrder[src.seed - 1]]?.name
    }
  }
  return undefined
}

function SlotRow({
  name,
  score,
  won = false,
  live = false,
  note,
  compact,
}: {
  name?: string
  score?: number
  won?: boolean
  live?: boolean
  note?: string
  compact?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 px-3 ${compact ? 'py-1' : 'py-1.5'}`}>
      <span
        className={`truncate font-cond ${compact ? 'text-base' : 'text-lg'} font-semibold ${
          won ? 'text-gold' : name ? 'text-board-text' : 'text-board-soft/60'
        }`}
      >
        {name ?? 'TBD'}
      </span>
      {note && <span className="font-cond text-xs uppercase text-board-soft/60">{note}</span>}
      {live && <span className="font-cond text-xs font-bold uppercase tracking-wider text-flame">live</span>}
      {score !== undefined && (
        <span className={`tabular font-display ${compact ? 'text-base' : 'text-lg'} ${won ? 'text-gold' : 'text-board-soft'}`}>
          {score}
        </span>
      )}
    </div>
  )
}
