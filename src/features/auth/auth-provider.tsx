import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  CrossTabSessionCoordinator,
  browserCrossTabSessionEnvironment,
  type SharedSessionState,
} from '@/lib/auth/cross-tab-session'
import {
  advanceAuthSessionGeneration,
  captureAuthSessionIdentity,
  isCurrentAuthSessionGeneration,
  useAuthSessionStore,
} from '@/lib/auth/session-store'
import { prepareSessionSafetyForAuthBoundary } from '@/lib/auth/session-safety-storage'
import { authApi as defaultAuthApi, type AuthApi } from './auth-api'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './auth-context'
import { isInvalidSessionError } from './auth-errors'
import { authQueryKeys } from './auth-query-keys'

export function AuthProvider({
  children,
  api = defaultAuthApi,
}: {
  children: ReactNode
  api?: AuthApi
}) {
  const queryClient = useQueryClient()
  const accessToken = useAuthSessionStore((state) => state.accessToken)
  const sessionVersion = useAuthSessionStore((state) => state.sessionVersion)
  const hydrated = useAuthSessionStore((state) => state.hydrated)
  const hydrate = useAuthSessionStore((state) => state.hydrate)
  const setAccessToken = useAuthSessionStore((state) => state.setAccessToken)
  const clearAccessToken = useAuthSessionStore(
    (state) => state.clearAccessToken,
  )
  const setValidated = useAuthSessionStore((state) => state.setValidated)
  const [crossTabReady, setCrossTabReady] = useState(false)
  const [remoteShared, setRemoteShared] = useState<
    SharedSessionState | null | undefined
  >(undefined)
  const [coordinator] = useState(
    () =>
      new CrossTabSessionCoordinator(
        browserCrossTabSessionEnvironment(),
        () => {
          const state = useAuthSessionStore.getState()
          return state.accessToken && state.sessionVersion
            ? {
                accessToken: state.accessToken,
                version: state.sessionVersion,
                validated: state.validated,
              }
            : null
        },
        setRemoteShared,
      ),
  )

  const isolateLocalSession = useCallback(() => {
    advanceAuthSessionGeneration()
    prepareSessionSafetyForAuthBoundary()
    void queryClient.cancelQueries()
    queryClient.clear()
    clearAccessToken()
  }, [clearAccessToken, queryClient])

  const acceptCandidate = useCallback(
    (candidate: { accessToken: string; version: string }) => {
      isolateLocalSession()
      setAccessToken(candidate.accessToken, candidate.version)
      setCrossTabReady(true)
    },
    [isolateLocalSession, setAccessToken],
  )

  useEffect(() => {
    hydrate()
    coordinator.start()
    let active = true
    queueMicrotask(async () => {
      if (!active) return
      const local = useAuthSessionStore.getState()
      const shared = coordinator.readSharedState()
      if (local.accessToken) {
        if (
          shared?.status === 'active' &&
          local.sessionVersion === shared.version
        ) {
          setCrossTabReady(true)
          return
        }
        if (!shared) {
          setAccessToken(
            local.accessToken,
            local.sessionVersion ?? coordinator.createVersion(),
          )
          setCrossTabReady(true)
          return
        }
        isolateLocalSession()
      }
      if (shared?.status === 'active') {
        const candidate = await coordinator.requestCurrentSession()
        if (active && candidate) acceptCandidate(candidate)
      }
      if (active) setCrossTabReady(true)
    })
    return () => {
      active = false
      coordinator.dispose()
    }
  }, [
    acceptCandidate,
    coordinator,
    hydrate,
    isolateLocalSession,
    setAccessToken,
  ])

  useEffect(() => {
    if (remoteShared === undefined) return
    queueMicrotask(() => {
      const local = useAuthSessionStore.getState()
      if (
        remoteShared?.status === 'active' &&
        local.accessToken &&
        local.sessionVersion === remoteShared.version
      ) {
        return
      }
      if (!local.accessToken && !local.sessionVersion) {
        if (remoteShared?.status === 'active') {
          void coordinator
            .requestCurrentSession()
            .then((candidate) => candidate && acceptCandidate(candidate))
        }
        return
      }
      isolateLocalSession()
      if (remoteShared?.status === 'active') {
        void coordinator
          .requestCurrentSession()
          .then((candidate) => candidate && acceptCandidate(candidate))
      }
    })
  }, [acceptCandidate, coordinator, isolateLocalSession, remoteShared])

  const currentUserQuery = useQuery({
    queryKey: authQueryKeys.me,
    queryFn: async () => {
      const identity = captureAuthSessionIdentity()
      const user = await api.getCurrentUser(accessToken!)
      const current = useAuthSessionStore.getState()
      if (
        !isCurrentAuthSessionGeneration(identity.generation) ||
        current.sessionVersion !== identity.sessionVersion
      ) {
        throw new Error('Stale auth bootstrap result')
      }
      return user
    },
    enabled: crossTabReady && hydrated && accessToken !== null,
  })

  useEffect(() => {
    if (!currentUserQuery.data || !accessToken || !sessionVersion) return
    queueMicrotask(() => {
      const current = useAuthSessionStore.getState()
      if (
        current.accessToken !== accessToken ||
        current.sessionVersion !== sessionVersion
      ) {
        return
      }
      setValidated(true)
      const shared = coordinator.readSharedState()
      if (shared?.status !== 'active' || shared.version !== sessionVersion) {
        coordinator.publishState({ version: sessionVersion, status: 'active' })
      }
    })
  }, [
    accessToken,
    coordinator,
    currentUserQuery.data,
    sessionVersion,
    setValidated,
  ])

  useEffect(() => {
    if (
      !accessToken ||
      !currentUserQuery.isError ||
      !isInvalidSessionError(currentUserQuery.error)
    ) {
      return
    }
    queueMicrotask(() => {
      const version = coordinator.createVersion()
      coordinator.publishState({ version, status: 'logged-out' })
      isolateLocalSession()
    })
  }, [
    accessToken,
    coordinator,
    currentUserQuery.error,
    currentUserQuery.isError,
    isolateLocalSession,
  ])

  const establishSession = async (nextAccessToken: string) => {
    const version = coordinator.createVersion()
    coordinator.publishState({ version, status: 'changing' })
    isolateLocalSession()
    setAccessToken(nextAccessToken, version)
    setCrossTabReady(true)
    const nextGeneration = useAuthSessionStore.getState().generation
    try {
      const user = await queryClient.fetchQuery({
        queryKey: authQueryKeys.me,
        queryFn: () => api.getCurrentUser(nextAccessToken),
      })
      const current = useAuthSessionStore.getState()
      if (
        current.accessToken !== nextAccessToken ||
        current.sessionVersion !== version ||
        current.generation !== nextGeneration
      ) {
        throw new Error('Stale session establishment')
      }
      setValidated(true)
      coordinator.publishState({ version, status: 'active' })
      return user
    } catch (error) {
      const current = useAuthSessionStore.getState()
      if (
        current.accessToken === nextAccessToken &&
        current.sessionVersion === version
      ) {
        coordinator.publishState({ version, status: 'logged-out' })
        isolateLocalSession()
      }
      throw error
    }
  }

  const signIn = async (input: Parameters<AuthContextValue['signIn']>[0]) => {
    const result = await api.login(input)
    return establishSession(result.accessToken)
  }

  const clearSession = () => {
    const version = coordinator.createVersion()
    coordinator.publishState({ version, status: 'logged-out' })
    isolateLocalSession()
  }

  let status: AuthStatus
  if (!hydrated || !crossTabReady) status = 'unknown'
  else if (!accessToken) status = 'unauthenticated'
  else if (currentUserQuery.data) status = 'authenticated'
  else if (
    currentUserQuery.isError &&
    !isInvalidSessionError(currentUserQuery.error)
  ) {
    status = 'error'
  } else status = 'bootstrapping'

  const value: AuthContextValue = {
    status,
    currentUser: currentUserQuery.data ?? null,
    bootstrapError: currentUserQuery.error,
    establishSession,
    signIn,
    retryBootstrap: () => {
      void currentUserQuery.refetch()
    },
    logout: clearSession,
  }
  return <AuthContext value={value}>{children}</AuthContext>
}
