import { useEffect, useRef, useState } from 'react'
import { remainingSec } from '../engine/ladder'
import type { RoundTimer } from '../types/tournament'

export interface Countdown {
  seconds: number
  display: string
  running: boolean
  expired: boolean
  /** 0 → 1 as the round progresses. */
  progress: number
}

export function formatClock(seconds: number): string {
  const s = Math.ceil(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Wall-clock derived countdown — never accumulates ticks, so tab suspension
 * and drift are harmless. `offsetMs` corrects viewer clocks against the server.
 */
export function useCountdown(timer: RoundTimer, offsetMs = 0): Countdown {
  const [, force] = useState(0)
  const seconds = remainingSec(timer, Date.now() + offsetMs)
  const running = timer.startedAt !== null && seconds > 0

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => force((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [running])

  return {
    seconds,
    display: formatClock(seconds),
    running,
    expired: timer.startedAt !== null && seconds <= 0,
    progress: timer.durationSec === 0 ? 0 : 1 - seconds / timer.durationSec,
  }
}

/** Two short horn bursts when the round expires. */
export function useWhistle(expired: boolean) {
  const fired = useRef(false)
  useEffect(() => {
    if (!expired) {
      fired.current = false
      return
    }
    if (fired.current) return
    fired.current = true
    try {
      const ctx = new AudioContext()
      const burst = (at: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = 440
        gain.gain.setValueAtTime(0.12, ctx.currentTime + at)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.45)
        osc.connect(gain).connect(ctx.destination)
        osc.start(ctx.currentTime + at)
        osc.stop(ctx.currentTime + at + 0.5)
      }
      burst(0)
      burst(0.6)
    } catch {
      // no audio permission — the flashing timer is the fallback
    }
  }, [expired])
}
