import type { Tournament } from '../types/tournament'

export interface PutResult {
  ok: boolean
  status: number
  error?: string
}

export interface GetResult {
  status: number
  tournament?: Tournament
  etag?: string
  serverNow?: number
}

export async function putTournament(
  tournament: Tournament,
  adminKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PutResult> {
  try {
    const res = await fetchImpl(`/api/t/${tournament.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminKey}`,
      },
      body: JSON.stringify(tournament),
    })
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() }
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network error' }
  }
}

export async function getTournament(
  id: string,
  etag?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GetResult> {
  try {
    const res = await fetchImpl(`/api/t/${id}`, {
      headers: etag ? { 'If-None-Match': etag } : {},
    })
    const serverNowHeader = res.headers.get('X-Server-Now')
    const serverNow = serverNowHeader ? Number(serverNowHeader) : undefined
    if (res.status !== 200) return { status: res.status, serverNow }
    return {
      status: 200,
      tournament: (await res.json()) as Tournament,
      etag: res.headers.get('ETag') ?? undefined,
      serverNow,
    }
  } catch {
    return { status: 0 }
  }
}
