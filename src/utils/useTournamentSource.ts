import { useEffect, useRef, useState } from 'react'
import { getTournament } from '../api/client'
import { useAppStore } from '../store/store'
import type { Tournament } from '../types/tournament'

export interface TournamentSource {
  tournament: Tournament | null
  /** Server-clock correction for countdowns; 0 when reading the local store. */
  offsetMs: number
  source: 'local' | 'remote'
  /** Seconds since the last successful remote fetch; null for local. */
  updatedAgoSec: number | null
  /** True once a remote id has definitively 404'd. */
  notFound: boolean
}

/**
 * The board and live views render from whichever source fits the device:
 * on the organizer laptop the local store (zero lag, survives the gym wifi
 * dying); on everyone else's device the public KV mirror, polled with ETags.
 */
export function useLocalTournament(): TournamentSource {
  const tournament = useAppStore((s) => s.tournament)
  return { tournament, offsetMs: 0, source: 'local', updatedAgoSec: null, notFound: false }
}

const POLL_MS = 5_000
const POLL_HIDDEN_PAUSE = true
const POLL_BACKOFF_MS = 15_000

export function useRemoteTournament(id: string): TournamentSource {
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null)
  const [, tick] = useState(0)
  const etagRef = useRef<string | undefined>(undefined)
  const offsetRef = useRef(0)
  const failuresRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      if (cancelled) return
      if (POLL_HIDDEN_PAUSE && document.hidden) return schedule(POLL_MS)
      const result = await getTournament(id, etagRef.current)
      if (cancelled) return
      if (result.serverNow) {
        const sample = result.serverNow - Date.now()
        // EMA smooths jitter; enough precision for a 12-minute countdown.
        offsetRef.current = offsetRef.current === 0 ? sample : offsetRef.current * 0.7 + sample * 0.3
      }
      if (result.status === 200 && result.tournament) {
        etagRef.current = result.etag
        setTournament(result.tournament)
        setNotFound(false)
        setLastFetchAt(Date.now())
        failuresRef.current = 0
      } else if (result.status === 304) {
        setLastFetchAt(Date.now())
        failuresRef.current = 0
      } else if (result.status === 404) {
        setNotFound(true)
      } else {
        failuresRef.current += 1
      }
      schedule(failuresRef.current >= 3 ? POLL_BACKOFF_MS : POLL_MS)
    }

    const schedule = (ms: number) => {
      timer = setTimeout(() => void poll(), ms)
    }

    const onVisible = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer)
        void poll()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [id])

  // Refresh the "updated Xs ago" stamp once a second while mounted.
  useEffect(() => {
    const idInt = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(idInt)
  }, [])

  return {
    tournament,
    offsetMs: Math.round(offsetRef.current),
    source: 'remote',
    updatedAgoSec: lastFetchAt === null ? null : Math.max(0, Math.round((Date.now() - lastFetchAt) / 1000)),
    notFound,
  }
}
