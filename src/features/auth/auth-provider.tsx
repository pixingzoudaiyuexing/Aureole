import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  type ReactNode,
} from 'react'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import {
  authApi as defaultAuthApi,
  type AuthApi,
  type CurrentUser,
  type LoginInput,
} from './auth-api'
import { isInvalidSessionError } from './auth-errors'

export const authQueryKeys = {
  me: ['auth', 'me'] as const,
}

export type AuthStatus =
  'unknown' | 'unauthenticated' | 'bootstrapping' | 'authenticated' | 'error'

interface AuthContextValue {
  status: AuthStatus
  currentUser: CurrentUser | null
  bootstrapError: unknown
  signIn: (input: LoginInput) => Promise<CurrentUser>
  retryBootstrap: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  children,
  api = defaultAuthApi,
}: {
  children: ReactNode
  api?: AuthApi
}) {
  const queryClient = useQueryClient()
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const hydrated = useAuthSessionStore((state) => state.hydrated)
  const hydrate = useAuthSessionStore((state) => state.hydrate)
  const setAccessToken = useAuthSessionStore((state) => state.setAccessToken)
  const clearAccessToken = useAuthSessionStore(
    (state) => state.clearAccessToken,
  )

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const currentUserQuery = useQuery({
    queryKey: authQueryKeys.me,
    queryFn: () => api.getCurrentUser(accessToken!),
    enabled: hydrated && accessToken !== null,
  })

  const clearSession = useCallback(() => {
    queryClient.clear()
    clearAccessToken()
  }, [clearAccessToken, queryClient])

  useEffect(() => {
    if (
      accessToken &&
      currentUserQuery.isError &&
      isInvalidSessionError(currentUserQuery.error)
    ) {
      clearSession()
    }
  }, [
    accessToken,
    clearSession,
    currentUserQuery.error,
    currentUserQuery.isError,
  ])

  const signIn = useCallback(
    async (input: LoginInput) => {
      const loginResult = await api.login(input)

      queryClient.clear()
      setAccessToken(loginResult.accessToken)

      try {
        return await queryClient.fetchQuery({
          queryKey: authQueryKeys.me,
          queryFn: () => api.getCurrentUser(loginResult.accessToken),
        })
      } catch (error) {
        if (isInvalidSessionError(error)) {
          clearSession()
        }
        throw error
      }
    },
    [api, clearSession, queryClient, setAccessToken],
  )

  let status: AuthStatus
  if (!hydrated) {
    status = 'unknown'
  } else if (!accessToken) {
    status = 'unauthenticated'
  } else if (currentUserQuery.isSuccess) {
    status = 'authenticated'
  } else if (
    currentUserQuery.isError &&
    !isInvalidSessionError(currentUserQuery.error)
  ) {
    status = 'error'
  } else {
    status = 'bootstrapping'
  }

  const value: AuthContextValue = {
    status,
    currentUser: currentUserQuery.data ?? null,
    bootstrapError: currentUserQuery.error,
    signIn,
    retryBootstrap: () => {
      void currentUserQuery.refetch()
    },
    logout: clearSession,
  }

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
