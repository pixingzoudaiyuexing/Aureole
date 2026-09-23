import { create } from 'zustand'
import {
  clearSessionCredential,
  clearSessionVersion,
  readSessionCredential,
  readSessionVersion,
  writeSessionCredential,
  writeSessionVersion,
} from './credential-storage'

interface AuthSessionState {
  accessToken: string | null
  sessionVersion: string | null
  generation: number
  hydrated: boolean
  validated: boolean
  hydrate: () => void
  setAccessToken: (accessToken: string, sessionVersion?: string) => void
  clearAccessToken: () => void
  setValidated: (validated: boolean) => void
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  accessToken: null,
  sessionVersion: null,
  generation: 0,
  hydrated: false,
  validated: false,
  hydrate: () =>
    set({
      accessToken: readSessionCredential(),
      sessionVersion: readSessionVersion(),
      hydrated: true,
      validated: false,
    }),
  setAccessToken: (accessToken, sessionVersion) => {
    writeSessionCredential(accessToken)
    if (sessionVersion) writeSessionVersion(sessionVersion)
    set({
      accessToken,
      sessionVersion: sessionVersion ?? null,
      hydrated: true,
      validated: false,
    })
  },
  clearAccessToken: () => {
    clearSessionCredential()
    clearSessionVersion()
    set({
      accessToken: null,
      sessionVersion: null,
      hydrated: true,
      validated: false,
    })
  },
  setValidated: (validated) => set({ validated }),
}))

export function advanceAuthSessionGeneration() {
  let nextGeneration = 0
  useAuthSessionStore.setState((state) => {
    nextGeneration = state.generation + 1
    return { generation: nextGeneration }
  })
  return nextGeneration
}

export function captureAuthSessionGeneration() {
  return useAuthSessionStore.getState().generation
}

export function isCurrentAuthSessionGeneration(generation: number) {
  return useAuthSessionStore.getState().generation === generation
}

export interface AuthSessionIdentity {
  accessToken: string | null
  generation: number
  sessionVersion: string | null
}

const authErrorIdentity = new WeakMap<object, AuthSessionIdentity>()

export function captureAuthSessionIdentity(): AuthSessionIdentity {
  const state = useAuthSessionStore.getState()
  return {
    accessToken: state.accessToken,
    generation: state.generation,
    sessionVersion: state.sessionVersion,
  }
}

export function tagErrorWithAuthSession(
  error: unknown,
  identity: AuthSessionIdentity,
) {
  if (typeof error === 'object' && error !== null) {
    authErrorIdentity.set(error, identity)
  }
}

export function isErrorFromCurrentAuthSession(error: unknown) {
  if (typeof error !== 'object' || error === null) return true
  const identity = authErrorIdentity.get(error)
  if (!identity) return true
  const current = captureAuthSessionIdentity()
  return (
    identity.accessToken === current.accessToken &&
    identity.generation === current.generation &&
    identity.sessionVersion === current.sessionVersion
  )
}

export function getErrorAuthSessionIdentity(error: unknown) {
  if (typeof error !== 'object' || error === null) return undefined
  return authErrorIdentity.get(error)
}
