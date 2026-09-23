import { createContext, useContext } from 'react'
import type { CurrentUser, LoginInput } from './auth-api'

export type AuthStatus =
  'unknown' | 'unauthenticated' | 'bootstrapping' | 'authenticated' | 'error'

export interface AuthContextValue {
  status: AuthStatus
  currentUser: CurrentUser | null
  bootstrapError: unknown
  establishSession: (user: CurrentUser) => Promise<CurrentUser>
  signIn: (input: LoginInput) => Promise<CurrentUser>
  retryBootstrap: () => void
  logout: () => void
  sessionInvalidated: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
