export type SessionSafetyMarker = 'active' | 'acknowledged'

export const sessionSafetyStorageKeys = {
  commissionTransferUncertainty:
    'aureole.safety.commission-transfer-uncertainty',
  withdrawalRequestUncertainty: 'aureole.safety.withdrawal-request-uncertainty',
} as const

export type SessionSafetyStorageKey =
  (typeof sessionSafetyStorageKeys)[keyof typeof sessionSafetyStorageKeys]

export interface SessionSafetyMarkerRead {
  ok: boolean
  value: SessionSafetyMarker | null
}

const unsafeAuthBoundaryKeys = new Set<SessionSafetyStorageKey>()

function readStoredSessionSafetyMarker(
  key: SessionSafetyStorageKey,
): SessionSafetyMarkerRead {
  try {
    const value = window.sessionStorage.getItem(key)
    if (value === null) return { ok: true, value: null }
    if (value !== 'active' && value !== 'acknowledged') {
      return { ok: false, value: null }
    }
    return { ok: true, value }
  } catch {
    return { ok: false, value: null }
  }
}

export function readSessionSafetyMarker(
  key: SessionSafetyStorageKey,
): SessionSafetyMarkerRead {
  const stored = readStoredSessionSafetyMarker(key)
  if (!unsafeAuthBoundaryKeys.has(key)) return stored
  if (!stored.ok) return stored
  if (stored.value !== 'active' && !writeSessionSafetyMarker(key, 'active')) {
    return { ok: false, value: null }
  }
  unsafeAuthBoundaryKeys.delete(key)
  return { ok: true, value: 'active' }
}

export function writeSessionSafetyMarker(
  key: SessionSafetyStorageKey,
  value: SessionSafetyMarker,
) {
  try {
    window.sessionStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function clearSessionSafetyMarker(key: SessionSafetyStorageKey) {
  try {
    window.sessionStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function clearSessionSafetyState() {
  let cleared = true
  for (const key of Object.values(sessionSafetyStorageKeys)) {
    if (!clearSessionSafetyMarker(key)) {
      cleared = false
    } else {
      unsafeAuthBoundaryKeys.delete(key)
    }
  }
  return cleared
}

export function prepareSessionSafetyForAuthBoundary() {
  let prepared = true
  for (const key of Object.values(sessionSafetyStorageKeys)) {
    const stored = readStoredSessionSafetyMarker(key)
    if (!stored.ok) {
      unsafeAuthBoundaryKeys.add(key)
      prepared = false
      continue
    }
    if (
      stored.value === 'acknowledged' &&
      !writeSessionSafetyMarker(key, 'active')
    ) {
      unsafeAuthBoundaryKeys.add(key)
      prepared = false
      continue
    }
    unsafeAuthBoundaryKeys.delete(key)
  }
  return prepared
}

export function resetSessionSafetyRuntimeForTests() {
  unsafeAuthBoundaryKeys.clear()
}
