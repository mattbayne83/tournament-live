import { Pause, Play } from 'lucide-react'
import type { RoundTimer } from '../types/tournament'
import { useCountdown, useWhistle } from '../utils/useCountdown'

export function TimerBar({
  timer,
  label,
  onPause,
  onResume,
}: {
  timer: RoundTimer
  label: string
  onPause?: () => void
  onResume?: () => void
}) {
  const cd = useCountdown(timer)
  useWhistle(cd.expired)
  const paused = timer.pausedRemainingSec !== null
  const urgent = cd.seconds <= 60 && (cd.running || cd.expired)

  return (
    <div className={`relative overflow-hidden ${cd.expired ? 'animate-pulse bg-flame-deep' : 'bg-ink'}`}>
      <div
        className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${urgent ? 'bg-flame-deep' : 'bg-ink-3'}`}
        style={{ width: `${Math.min(100, cd.progress * 100)}%` }}
      />
      <div className="relative flex items-center justify-between gap-4 px-5 py-3">
        <span className="font-cond text-sm font-semibold uppercase tracking-[0.25em] text-board-soft">
          {cd.expired ? 'Time! finish the rally' : label}
        </span>
        <div className="flex items-center gap-4">
          <span className={`tabular font-display text-4xl leading-none ${urgent ? 'text-gold' : 'text-board-text'}`}>
            {cd.display}
          </span>
          {(onPause || onResume) && (
            <button
              onClick={paused ? onResume : onPause}
              aria-label={paused ? 'resume timer' : 'pause timer'}
              className="grid h-10 w-10 place-items-center border-2 border-ink-3 text-board-soft hover:border-flame hover:text-flame"
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
