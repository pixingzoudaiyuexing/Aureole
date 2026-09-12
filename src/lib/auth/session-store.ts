import { create } from 'zustand'
import {
  clearSessionCredential,
  readSessionCredential,
  writeSessionCredential,
} from './credential-storage'

interface AuthSessionState {
  accessToken: string | null
  hydrated: boolean
  hydrate: () => void
  setAccessToken: (accessToken: string) => void
  clearAccessToken: () => void
}

export const useAuthSessionStore = create<AuthSessionState>((set) => ({
  accessToken: null,
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
