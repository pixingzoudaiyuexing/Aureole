export interface SessionDatabase {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>
      run(): Promise<{ success: boolean; meta?: { changes?: number } }>
    }
  }
  batch?(
    statements: unknown[],
  ): Promise<{ success: boolean; meta?: { changes?: number } }[]>
  withSession?(session: 'first-primary'): SessionDatabase
}

export interface SessionEnv {
  AUREOLE_SESSION_DB?: SessionDatabase
  AUREOLE_SESSION_ENCRYPTION_KEY?: string
}

export const COOKIE_NAME = '__Host-aureole_session'
export const FAMILY_COOKIE_NAME = '__Host-aureole_family'
export const SESSION_SECONDS = 7 * 24 * 60 * 60

interface SessionRow {
  encrypted_upstream_token: string
  encryption_nonce: string
  encryption_key_version: number
  expires_at: number
  revoked_at: number | null
  family_id: string
  public_version: string
}

export class SessionUnavailable extends Error {}
export class SessionChanged extends Error {}

function database(env: SessionEnv) {
  if (!env.AUREOLE_SESSION_DB?.withSession) throw new SessionUnavailable()
  return env.AUREOLE_SESSION_DB.withSession('first-primary')
}

function decodeKey(value?: string): Uint8Array<ArrayBuffer> {
  if (!value || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new SessionUnavailable()
  }
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=')
  const bytes = new Uint8Array(new ArrayBuffer(32))
  for (let index = 0; index < raw.length; index++)
    bytes[index] = raw.charCodeAt(index)
  return bytes
}

async function cryptoKey(env: SessionEnv) {
  return crypto.subtle.importKey(
    'raw',
    decodeKey(env.AUREOLE_SESSION_ENCRYPTION_KEY),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(
    value.replace(/-/g, '+').replace(/_/g, '/') +
      '='.repeat((4 - (value.length % 4)) % 4),
  )
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let index = 0; index < raw.length; index++)
    bytes[index] = raw.charCodeAt(index)
  return bytes
}

async function hash(id: string) {
  return encode(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id)),
    ),
  )
}

export function readCookie(request: Request): string | null {
  const values = (request.headers.get('cookie')?.split(';') ?? [])
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${COOKIE_NAME}=`))
  if (values.length !== 1) return null
  const id = values[0]?.slice(COOKIE_NAME.length + 1) ?? ''
  return /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null
}

export function setCookie(id: string, maxAge: number) {
  return `${COOKIE_NAME}=${id}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`
}

export function clearCookie() {
  return setCookie('', 0)
}

export function readFamilyCookie(request: Request) {
  const values = (request.headers.get('cookie')?.split(';') ?? [])
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${FAMILY_COOKIE_NAME}=`))
  if (values.length !== 1) return null
  const id = values[0]?.slice(FAMILY_COOKIE_NAME.length + 1) ?? ''
  return /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null
}

export function newFamilyId() {
  return encode(crypto.getRandomValues(new Uint8Array(32)))
}

export function setFamilyCookie(id: string) {
  return `${FAMILY_COOKIE_NAME}=${id}; Path=/; Max-Age=${SESSION_SECONDS}; Secure; HttpOnly; SameSite=Lax`
}

export async function beginSessionIntent(env: SessionEnv, familyId: string) {
  const db = database(env)
  const familyHash = await hash(familyId)
  const created = await db
    .prepare('INSERT OR IGNORE INTO auth_families (family_id) VALUES (?)')
    .bind(familyHash)
    .run()
  if (!created.success) throw new SessionUnavailable()
  const intent = await db
    .prepare(
      'UPDATE auth_families SET intent_epoch = intent_epoch + 1 WHERE family_id = ? RETURNING intent_epoch',
    )
    .bind(familyHash)
    .first<{ intent_epoch: number }>()
  if (!intent || !Number.isSafeInteger(intent.intent_epoch))
    throw new SessionUnavailable()
  return intent.intent_epoch
}

export async function createSession(
  env: SessionEnv,
  token: string,
  expiry: number,
  familyId: string,
  intentEpoch: number,
) {
  const id = encode(crypto.getRandomValues(new Uint8Array(32)))
  const publicVersion = crypto.randomUUID()
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    await cryptoKey(env),
    new TextEncoder().encode(token),
  )
  const now = Math.floor(Date.now() / 1000)
  if (expiry <= now) throw new SessionUnavailable()
  const db = database(env)
  const familyHash = await hash(familyId)
  const idHash = await hash(id)
  if (!db.batch) throw new SessionUnavailable()
  const results = await db.batch([
    db
      .prepare(
        'UPDATE auth_families SET current_session_id_hash = ? WHERE family_id = ? AND intent_epoch = ?',
      )
      .bind(idHash, familyHash, intentEpoch),
    db
      .prepare(
        'INSERT INTO auth_sessions (session_id_hash, encrypted_upstream_token, encryption_nonce, encryption_key_version, created_at, expires_at, revoked_at, version, family_id, public_version) SELECT ?, ?, ?, 1, ?, ?, NULL, 1, ?, ? WHERE EXISTS (SELECT 1 FROM auth_families WHERE family_id = ? AND current_session_id_hash = ?)',
      )
      .bind(
        idHash,
        encode(new Uint8Array(encrypted)),
        encode(nonce),
        now,
        expiry,
        familyHash,
        publicVersion,
        familyHash,
        idHash,
      ),
  ])
  if (results.some((result) => !result.success)) throw new SessionUnavailable()
  if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1)
    throw new SessionChanged()
  return { id, publicVersion }
}

export async function loadSession(
  env: SessionEnv,
  id: string,
  familyId: string,
): Promise<{ token: string; expiresAt: number; publicVersion: string } | null> {
  const row = await database(env)
    .prepare(
      'SELECT s.encrypted_upstream_token, s.encryption_nonce, s.encryption_key_version, s.expires_at, s.revoked_at, s.family_id, s.public_version FROM auth_sessions s JOIN auth_families f ON f.family_id = s.family_id AND f.current_session_id_hash = s.session_id_hash WHERE s.session_id_hash = ?',
    )
    .bind(await hash(id))
    .first<SessionRow>()
  if (
    !row ||
    row.revoked_at !== null ||
    row.expires_at <= Math.floor(Date.now() / 1000) ||
    row.family_id !== (await hash(familyId))
  )
    return null
  if (row.encryption_key_version !== 1) throw new SessionUnavailable()
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(row.encryption_nonce) },
      await cryptoKey(env),
      decode(row.encrypted_upstream_token),
    )
    return {
      token: new TextDecoder().decode(plaintext),
      expiresAt: row.expires_at,
      publicVersion: row.public_version,
    }
  } catch {
    throw new SessionUnavailable()
  }
}

export async function revokeSession(
  env: SessionEnv,
  id: string,
  familyId: string,
) {
  const db = database(env)
  const idHash = await hash(id)
  const familyHash = await hash(familyId)
  if (!db.batch) throw new SessionUnavailable()
  const results = await db.batch([
    db
      .prepare(
        'UPDATE auth_families SET current_session_id_hash = NULL, intent_epoch = intent_epoch + 1 WHERE family_id = ? AND current_session_id_hash = ?',
      )
      .bind(familyHash, idHash),
    db
      .prepare(
        'UPDATE auth_sessions SET revoked_at = ?, version = version + 1 WHERE session_id_hash = ? AND family_id = ? AND revoked_at IS NULL',
      )
      .bind(Math.floor(Date.now() / 1000), idHash, familyHash),
  ])
  if (results.some((result) => !result.success)) throw new SessionUnavailable()
}
