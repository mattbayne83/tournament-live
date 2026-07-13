interface Env {
  TOURNAMENTS: KVNamespace
}

const MAX_BODY_BYTES = 1_000_000
const blobKey = (id: string) => `t:${id}`
const authKey = (id: string) => `t:${id}:auth`

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const baseHeaders = { 'Cache-Control': 'no-store', 'X-Server-Now': '' }
const withNow = (extra: Record<string, string> = {}) => ({
  ...baseHeaders,
  ...extra,
  'X-Server-Now': String(Date.now()),
})

export const onRequestGet: PagesFunction<Env> = async ({ params, env, request }) => {
  const id = String(params.id)
  const { value, metadata } = await env.TOURNAMENTS.getWithMetadata<{ rev?: number }>(blobKey(id), 'text')
  if (value === null) return new Response('not found', { status: 404, headers: withNow() })

  const etag = `W/"${metadata?.rev ?? 0}"`
  if (request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: withNow({ ETag: etag }) })
  }
  return new Response(value, {
    status: 200,
    headers: withNow({ ETag: etag, 'Content-Type': 'application/json' }),
  })
}

export const onRequestPut: PagesFunction<Env> = async ({ params, env, request }) => {
  const id = String(params.id)
  const auth = request.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ') || auth.length < 20) {
    return new Response('missing admin key', { status: 401, headers: withNow() })
  }
  const keyHash = await sha256Hex(auth.slice('Bearer '.length))

  const body = await request.text()
  if (body.length > MAX_BODY_BYTES) return new Response('too large', { status: 413, headers: withNow() })

  let rev: number
  let bodyId: string
  try {
    const parsed = JSON.parse(body) as { rev?: unknown; id?: unknown }
    rev = Number(parsed.rev)
    bodyId = String(parsed.id)
    if (!Number.isFinite(rev) || rev < 1) throw new Error('bad rev')
  } catch {
    return new Response('not a tournament', { status: 400, headers: withNow() })
  }
  if (bodyId !== id) return new Response('id mismatch', { status: 400, headers: withNow() })

  const storedHash = await env.TOURNAMENTS.get(authKey(id))
  if (storedHash === null) {
    // Claim-on-first-write: this admin key owns the id from now on.
    await env.TOURNAMENTS.put(authKey(id), keyHash)
  } else if (storedHash !== keyHash) {
    return new Response('wrong admin key', { status: 401, headers: withNow() })
  }

  const { metadata } = await env.TOURNAMENTS.getWithMetadata<{ rev?: number }>(blobKey(id), 'stream')
  const storedRev = metadata?.rev ?? 0
  if (rev <= storedRev) {
    return new Response(`stale rev ${rev} <= ${storedRev}`, { status: 409, headers: withNow() })
  }

  await env.TOURNAMENTS.put(blobKey(id), body, { metadata: { rev } })
  return new Response(JSON.stringify({ rev }), {
    status: 200,
    headers: withNow({ 'Content-Type': 'application/json' }),
  })
}
