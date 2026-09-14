import { create } from 'zustand'
import {
  clearSessionCredential,
  readSessionCredential,
  writeSessionCredential,
} from './credential-storage'

interface AuthSessionState {
  accessToken: string | null
  generation: number
  hydrated: boolean
  hydrate: () => void
  setAccessToken: (accessToken: string) => void
  clearAccessToken: () => void
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  accessToken: null,
  generation: 0,
  hydrated: false,
  hydrate: () =>
    set({
      accessToken: readSessionCredential(),
      hydrated: true,
    }),
  setAccessToken: (accessToken) => {
    writeSessionCredential(accessToken)
    set({ accessToken, hydrated: true })
  },
  clearAccessToken: () => {
    clearSessionCredential()
    set({ accessToken: null, hydrated: true })
  },
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
