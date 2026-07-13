/** Crockford-ish base32 — no 0/O or 1/l/I confusion when read aloud at a gym. */
const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789'

function randomString(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
}

/** Public tournament slug — unguessable enough to double as the share secret. */
export const newTournamentId = () => randomString(10)

/** Shown once at creation; only its SHA-256 ever reaches the server. */
export const newAdminKey = () => randomString(26)

export const shortId = (prefix: string) => `${prefix}-${randomString(6)}`
