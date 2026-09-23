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
  getErrorAuthSessionIdentity,
  isErrorFromCurrentAuthSession,
  isCurrentAuthSessionGeneration,
  tagErrorWithAuthSession,
  type AuthSessionIdentity,
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

  const acceptCandidateIfCurrent = useCallback(
    (
      candidate: { accessToken: string; version: string },
      expectedIdentity: AuthSessionIdentity,
    ) => {
      const current = captureAuthSessionIdentity()
      if (
        current.generation !== expectedIdentity.generation ||
        current.accessToken !== expectedIdentity.accessToken ||
        current.sessionVersion !== expectedIdentity.sessionVersion ||
        !coordinator.isSharedActive(candidate.version)
      ) {
        return false
      }
      isolateLocalSession()
      setAccessToken(candidate.accessToken, candidate.version)
      setCrossTabReady(true)
      return true
    },
    [coordinator, isolateLocalSession, setAccessToken],
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
        const expectedIdentity = captureAuthSessionIdentity()
        const candidate = await coordinator.requestCurrentSession()
        if (active && candidate) {
          acceptCandidateIfCurrent(candidate, expectedIdentity)
        }
      }
      if (active) setCrossTabReady(true)
    })
    return () => {
      active = false
      coordinator.dispose()
    }
  }, [
    acceptCandidateIfCurrent,
    coordinator,
    hydrate,
    isolateLocalSession,
    setAccessToken,
  ])

  useEffect(() => {
    if (remoteShared === undefined || remoteShared === null) return
    queueMicrotask(() => {
      const shared = coordinator.readSharedState()
      if (!shared) return
      const local = useAuthSessionStore.getState()
      if (
        shared.status !== 'logged-out' &&
        local.accessToken &&
        local.sessionVersion === shared.version
      ) {
        return
      }
      if (!local.accessToken && !local.sessionVersion) {
        if (shared.status === 'active') {
          const expectedIdentity = captureAuthSessionIdentity()
          void coordinator
            .requestCurrentSession()
            .then(
              (candidate) =>
                candidate &&
                acceptCandidateIfCurrent(candidate, expectedIdentity),
            )
        }
        return
      }
      isolateLocalSession()
      if (shared.status === 'active') {
        const expectedIdentity = captureAuthSessionIdentity()
        void coordinator
          .requestCurrentSession()
          .then(
            (candidate) =>
              candidate &&
              acceptCandidateIfCurrent(candidate, expectedIdentity),
          )
      }
    })
  }, [acceptCandidateIfCurrent, coordinator, isolateLocalSession, remoteShared])

  const currentUserQuery = useQuery({
    queryKey: authQueryKeys.me,
    queryFn: async () => {
      const identity = captureAuthSessionIdentity()
      let user
      try {
        user = await api.getCurrentUser(accessToken!)
      } catch (error) {
        tagErrorWithAuthSession(error, identity)
        throw error
      }
      const current = useAuthSessionStore.getState()
      if (
        !isCurrentAuthSessionGeneration(identity.generation) ||
        current.accessToken !== identity.accessToken ||
        current.sessionVersion !== identity.sessionVersion ||
        !identity.sessionVersion ||
        !coordinator.isVersionCurrent(identity.sessionVersion, [
          'active',
          'changing',
        ])
      ) {
        coordinator.reconcile()
        throw new Error('Stale auth bootstrap result')
      }
      return user
    },
    enabled: crossTabReady && hydrated && accessToken !== null,
  })

  useEffect(() => {
    if (!currentUserQuery.data || !accessToken || !sessionVersion) return
    queueMicrotask(() => {
      const expectedIdentity = captureAuthSessionIdentity()
      if (
        expectedIdentity.accessToken !== accessToken ||
        expectedIdentity.sessionVersion !== sessionVersion
      ) {
        return
      }
      void coordinator.publishActiveIfCurrent(sessionVersion).then((result) => {
        const current = captureAuthSessionIdentity()
        if (
          current.accessToken !== expectedIdentity.accessToken ||
          current.generation !== expectedIdentity.generation ||
          current.sessionVersion !== expectedIdentity.sessionVersion
        ) {
          return
        }
        if (result === 'conflict') {
          isolateLocalSession()
          return
        }
        setValidated(true)
      })
    })
  }, [
    accessToken,
    coordinator,
    currentUserQuery.data,
    sessionVersion,
    setValidated,
    isolateLocalSession,
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
      if (!isErrorFromCurrentAuthSession(currentUserQuery.error)) return
      const identity = getErrorAuthSessionIdentity(currentUserQuery.error)
      const current = useAuthSessionStore.getState()
      if (
        !identity?.sessionVersion ||
        current.accessToken !== identity.accessToken ||
        current.generation !== identity.generation ||
        current.sessionVersion !== identity.sessionVersion
      ) {
        return
      }
      const publication = coordinator.publishLogoutIfCurrent(
        identity.sessionVersion,
        coordinator.createVersion(),
      )
      isolateLocalSession()
      void publication
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
    await coordinator.publishState({ version, status: 'changing' })
    isolateLocalSession()
    setAccessToken(nextAccessToken, version)
    setCrossTabReady(true)
    const nextGeneration = useAuthSessionStore.getState().generation
    try {
      const user = await queryClient.fetchQuery({
        queryKey: authQueryKeys.me,
        queryFn: async () => {
          try {
            return await api.getCurrentUser(nextAccessToken)
          } catch (error) {
            tagErrorWithAuthSession(error, {
              accessToken: nextAccessToken,
              generation: nextGeneration,
              sessionVersion: version,
            })
            throw error
          }
        },
      })
      let current = useAuthSessionStore.getState()
      if (
        current.accessToken !== nextAccessToken ||
        current.sessionVersion !== version ||
        current.generation !== nextGeneration
      ) {
        throw new Error('Stale session establishment')
      }
      const publication = await coordinator.publishActiveIfCurrent(version)
      current = useAuthSessionStore.getState()
      if (
        current.accessToken !== nextAccessToken ||
        current.sessionVersion !== version ||
        current.generation !== nextGeneration
      ) {
        throw new Error('Stale session establishment')
      }
      if (publication === 'conflict') {
        isolateLocalSession()
        throw new Error('Shared session version changed')
      }
      setValidated(true)
      return user
    } catch (error) {
      tagErrorWithAuthSession(error, {
        accessToken: nextAccessToken,
        generation: nextGeneration,
        sessionVersion: version,
      })
      const current = useAuthSessionStore.getState()
      if (
        current.accessToken === nextAccessToken &&
        current.sessionVersion === version
      ) {
        if (!coordinator.isVersionCurrent(version, ['active', 'changing'])) {
          isolateLocalSession()
        } else if (isInvalidSessionError(error)) {
          const publication = coordinator.publishLogoutIfCurrent(
            version,
            coordinator.createVersion(),
          )
          isolateLocalSession()
          void publication
        }
      }
      throw error
    }
  }

  const signIn = async (input: Parameters<AuthContextValue['signIn']>[0]) => {
    const result = await api.login(input)
    return establishSession(result.accessToken)
  }

  const clearSession = () => {
    const current = useAuthSessionStore.getState()
    if (current.sessionVersion) {
      const publication = coordinator.publishLogoutIfCurrent(
        current.sessionVersion,
        coordinator.createVersion(),
      )
      void publication
    }
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
