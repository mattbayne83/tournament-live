import type { Tournament } from '../types/tournament'
import type { AppStore } from './store'

const tournamentKey = (id: string) => `pbt:t:${id}`
const adminKeyKey = (id: string) => `pbt:admin:${id}`
const CURRENT_KEY = 'pbt:currentId'

export function migrate(raw: unknown): Tournament | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Tournament
  if (t.schemaVersion !== 1) return null // future migrations chain here
  return t
}

export interface Persistence {
  /** Loads the last-open tournament into the store, if one exists. */
  loadCurrent: () => boolean
  flush: () => void
  stop: () => void
}

interface StoreLike {
  getState: () => AppStore
  subscribe: (listener: (state: AppStore, prev: AppStore) => void) => () => void
}

/**
 * Debounced localStorage autosave keyed per tournament, with a synchronous
 * flush on pagehide (iOS Safari kills backgrounded tabs without warning).
 */
export function createPersistence(
  store: StoreLike,
  storage: Storage,
  debounceMs = 300,
): Persistence {
  let timer: ReturnType<typeof setTimeout> | null = null

  const write = () => {
    timer = null
    const { tournament, adminKey } = store.getState()
    if (!tournament) return
    try {
      storage.setItem(tournamentKey(tournament.id), JSON.stringify(tournament))
      storage.setItem(CURRENT_KEY, tournament.id)
      if (adminKey) storage.setItem(adminKeyKey(tournament.id), adminKey)
    } catch {
      // Storage full or unavailable — the KV mirror and export are the fallbacks.
    }
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.tournament === prev.tournament) return
    if (!state.tournament) {
      storage.removeItem(CURRENT_KEY)
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(write, debounceMs)
  })

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      write()
    }
  }

  const onPageHide = () => flush()
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
  }

  return {
    loadCurrent: () => {
      const id = storage.getItem(CURRENT_KEY)
      if (!id) return false
      const raw = storage.getItem(tournamentKey(id))
      if (!raw) return false
      try {
        const tournament = migrate(JSON.parse(raw))
        if (!tournament) return false
        store.getState().loadTournament(tournament, storage.getItem(adminKeyKey(id)))
        return true
      } catch {
        return false
      }
    },
    flush,
    stop: () => {
      unsubscribe()
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide)
    },
  }
}

/** Backup file includes the admin key — it's the organizer's own disaster recovery. */
export function exportBackup(t: Tournament, adminKey: string | null): string {
  return JSON.stringify({ pbtBackup: 1, adminKey, tournament: t }, null, 2)
}

export function importBackup(json: string): { tournament: Tournament; adminKey: string | null } {
  const raw = JSON.parse(json) as { pbtBackup?: number; adminKey?: string | null; tournament?: unknown }
  const candidate = raw?.pbtBackup === 1 ? raw.tournament : raw
  const tournament = migrate(candidate)
  if (!tournament) throw new Error('not a recognizable tournament file')
  return { tournament, adminKey: raw?.pbtBackup === 1 ? (raw.adminKey ?? null) : null }
}
