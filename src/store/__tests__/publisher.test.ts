import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPublisher, type Publisher } from '../publisher'
import { useAppStore } from '../store'

const store = useAppStore

function okResponse(): Response {
  return new Response('{"rev":1}', { status: 200 })
}

function errResponse(status: number): Response {
  return new Response('nope', { status })
}

let publisher: Publisher | null = null

beforeEach(() => {
  vi.useFakeTimers()
  store.getState().closeTournament()
})

afterEach(() => {
  publisher?.stop()
  publisher = null
  vi.useRealTimers()
})

async function settle(ms: number) {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('publisher', () => {
  it('publishes a dirty tournament once and clears the flag', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    publisher = createPublisher(store, fetchMock as typeof fetch, 5000)
    store.getState().createTournament('Test', 8)
    await settle(10)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/t/${store.getState().tournament!.id}`)
    expect(init.method).toBe('PUT')
    expect(store.getState().sync.dirty).toBe(false)
    expect(store.getState().sync.publishCount).toBe(1)
    expect(store.getState().sync.lastPublishedRev).toBe(1)
  })

  it('coalesces rapid commits into one write per interval, always sending latest', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    publisher = createPublisher(store, fetchMock as typeof fetch, 5000)
    store.getState().createTournament('Test', 8)
    await settle(10)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Three quick edits inside the 5s window.
    store.getState().addDivision('A', 'ladder')
    store.getState().addDivision('B', 'ladder')
    store.getState().addDivision('C', 'pools')
    await settle(100)
    expect(fetchMock).toHaveBeenCalledTimes(1) // still coalescing

    await settle(5000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse(fetchMock.mock.calls[1][1].body)
    expect(body.rev).toBe(store.getState().tournament!.rev)
    expect(body.divisions).toHaveLength(3)
    expect(store.getState().sync.dirty).toBe(false)
  })

  it('backs off on failure, keeps the dirty flag, then recovers', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errResponse(500))
      .mockResolvedValueOnce(errResponse(500))
      .mockResolvedValue(okResponse())
    publisher = createPublisher(store, fetchMock as typeof fetch, 5000)
    store.getState().createTournament('Test', 8)

    await settle(10)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(store.getState().sync.status).toBe('error')
    expect(store.getState().sync.dirty).toBe(true)

    await settle(10_000) // first backoff
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await settle(20_000) // second backoff, doubled
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(store.getState().sync.status).toBe('idle')
    expect(store.getState().sync.dirty).toBe(false)
  })

  it('treats a network throw as offline and retries', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(okResponse())
    publisher = createPublisher(store, fetchMock as typeof fetch, 5000)
    store.getState().createTournament('Test', 8)
    await settle(10)
    expect(store.getState().sync.status).toBe('offline')
    await settle(10_000)
    expect(store.getState().sync.status).toBe('idle')
  })

  it('never publishes without an admin key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse())
    publisher = createPublisher(store, fetchMock as typeof fetch, 5000)
    store.getState().createTournament('Test', 8)
    useAppStore.setState({ adminKey: null })
    store.getState().addDivision('A', 'ladder')
    await settle(10_000)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
