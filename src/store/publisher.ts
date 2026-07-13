import { putTournament } from '../api/client'
import type { AppStore } from './store'

interface StoreLike {
  getState: () => AppStore
  subscribe: (listener: (state: AppStore, prev: AppStore) => void) => () => void
  setState: (partial: Partial<AppStore>) => void
}

export interface Publisher {
  stop: () => void
  /** Force a publish attempt now (e.g. "retry" button). */
  kick: () => void
}

const MIN_INTERVAL_MS = 5_000
const MAX_BACKOFF_MS = 60_000

/**
 * Dirty-flag publish loop: full-state last-write-wins means intermediate
 * states are worthless, so we always send the latest and coalesce to at most
 * one KV write per MIN_INTERVAL_MS. Local play never blocks on the network.
 */
export function createPublisher(
  store: StoreLike,
  fetchImpl: typeof fetch = fetch,
  minIntervalMs = MIN_INTERVAL_MS,
): Publisher {
  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight = false
  let stopped = false
  let backoffMs = minIntervalMs
  let lastAttemptAt = 0

  const setSync = (partial: Partial<AppStore['sync']>) => {
    store.setState({ sync: { ...store.getState().sync, ...partial } })
  }

  const schedule = (delay: number) => {
    if (stopped || timer) return
    timer = setTimeout(() => {
      timer = null
      void attempt()
    }, delay)
  }

  const attempt = async () => {
    if (stopped || inflight) return
    const { tournament, adminKey, sync } = store.getState()
    if (!tournament || !adminKey || !sync.dirty) return

    const wait = lastAttemptAt + minIntervalMs - Date.now()
    if (wait > 0) return schedule(wait)

    inflight = true
    lastAttemptAt = Date.now()
    const publishedRev = tournament.rev
    setSync({ status: 'publishing' })
    const result = await putTournament(tournament, adminKey, fetchImpl)
    inflight = false
    if (stopped) return

    if (result.ok) {
      backoffMs = minIntervalMs
      const stillDirty = store.getState().tournament!.rev > publishedRev
      setSync({
        status: 'idle',
        dirty: stillDirty,
        lastPublishedRev: publishedRev,
        publishCount: store.getState().sync.publishCount + 1,
        lastError: undefined,
      })
      if (stillDirty) schedule(minIntervalMs)
    } else {
      setSync({
        status: result.status === 0 ? 'offline' : 'error',
        lastError: result.error ?? `HTTP ${result.status}`,
      })
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
      schedule(backoffMs)
    }
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.sync.dirty && (!prev.sync.dirty || state.tournament !== prev.tournament)) {
      schedule(0)
    }
  })

  const onOnline = () => {
    backoffMs = minIntervalMs
    schedule(0)
  }
  if (typeof window !== 'undefined') window.addEventListener('online', onOnline)

  return {
    kick: () => {
      backoffMs = minIntervalMs
      lastAttemptAt = 0
      schedule(0)
    },
    stop: () => {
      stopped = true
      unsubscribe()
      if (timer) clearTimeout(timer)
      if (typeof window !== 'undefined') window.removeEventListener('online', onOnline)
    },
  }
}
