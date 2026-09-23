import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  advanceAuthSessionGeneration,
  captureAuthSessionGeneration,
  useAuthSessionStore,
} from '@/lib/auth/session-store'
import { prepareSessionSafetyForAuthBoundary } from '@/lib/auth/session-safety-storage'
import {
  isolateSupportWidgetSession,
  setSupportWidgetIdentityReady,
} from '@/features/support-widget/support-widget-runtime'
import {
  authApi as defaultAuthApi,
  type AuthApi,
  type CurrentUser,
} from './auth-api'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
} from './auth-context'
import { isInvalidSessionError } from './auth-errors'
import { authQueryKeys } from './auth-query-keys'

const CHANNEL = 'aureole.auth.refresh'

export function AuthProvider({
  children,
  api = defaultAuthApi,
}: {
  children: ReactNode
  api?: AuthApi
}) {
  const queryClient = useQueryClient()
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checking, setChecking] = useState(false)
  const active = useRef(true)
  const channel = useRef<BroadcastChannel | null>(null)
  const checkSequence = useRef(0)
  const userRef = useRef<CurrentUser | null>(null)
  const versionRef = useRef<string | null>(null)
  const mutationSequence = useRef(0)
  const backgroundCheck = useRef<Promise<void> | null>(null)
  const identity = useAuthSessionStore((state) => state.accessToken)
  useQuery({
    queryKey: authQueryKeys.me,
    queryFn: async () => {
      const generation = captureAuthSessionGeneration()
      const result = await api.getCurrentUser('')
      if (generation !== captureAuthSessionGeneration())
        throw new Error('Session changed during account read')
      return result
    },
    enabled: Boolean(identity),
    retry: false,
    staleTime: Infinity,
  })

  const isolate = useCallback(
    (identityChanged = true) => {
      isolateSupportWidgetSession()
      setSupportWidgetIdentityReady(false)
      advanceAuthSessionGeneration()
      if (identityChanged) prepareSessionSafetyForAuthBoundary()
      void queryClient.cancelQueries()
      queryClient.clear()
      useAuthSessionStore.getState().clearAccessToken()
      userRef.current = null
      versionRef.current = null
      setUser(null)
      setError(null)
      setChecking(false)
    },
    [queryClient],
  )

  const notify = useCallback(
    () => channel.current?.postMessage({ type: 'refresh' }),
    [],
  )

  const pauseForVerification = useCallback(
    (cause: unknown) => {
      isolateSupportWidgetSession()
      setSupportWidgetIdentityReady(false)
      advanceAuthSessionGeneration()
      prepareSessionSafetyForAuthBoundary()
      void queryClient.cancelQueries()
      queryClient.clear()
      useAuthSessionStore.getState().clearAccessToken()
      userRef.current = null
      versionRef.current = null
      setUser(null)
      setError(cause)
    },
    [queryClient],
  )

  const verify = useCallback(
    async (background = false, initial = false) => {
      const sequence = ++checkSequence.current
      const generation = captureAuthSessionGeneration()
      const mutation = mutationSequence.current
      if (!background || !useAuthSessionStore.getState().validated)
        setChecking(true)
      try {
        const first = await api.getCurrentUser('')
        const current =
          background || initial ? first : await api.getCurrentUser('')
        if (
          !active.current ||
          sequence !== checkSequence.current ||
          generation !== captureAuthSessionGeneration() ||
          mutation !== mutationSequence.current
        )
          return
        if (first.sessionVersion !== current.sessionVersion) {
          isolate()
          setError(new Error('Session changed during verification'))
          return
        }
        const previous = useAuthSessionStore.getState()
        if (
          !previous.validated ||
          userRef.current?.email !== current.email ||
          versionRef.current !== (current.sessionVersion ?? null)
        ) {
          isolate(previous.validated)
          useAuthSessionStore
            .getState()
            .setAccessToken(crypto.randomUUID(), current.sessionVersion)
          useAuthSessionStore.getState().setValidated(true)
        }
        userRef.current = current
        setSupportWidgetIdentityReady(true)
        versionRef.current = current.sessionVersion ?? null
        queryClient.setQueryData(authQueryKeys.me, current)
        setUser(current)
        setError(null)
      } catch (cause) {
        if (
          !active.current ||
          sequence !== checkSequence.current ||
          generation !== captureAuthSessionGeneration() ||
          mutation !== mutationSequence.current
        )
          return
        if (isInvalidSessionError(cause)) {
          isolate()
          setSupportWidgetIdentityReady(true)
        } else if (!background || !useAuthSessionStore.getState().validated) {
          pauseForVerification(cause)
        }
      } finally {
        if (active.current && sequence === checkSequence.current) {
          setChecking(false)
          setReady(true)
        }
      }
    },
    [api, isolate, pauseForVerification, queryClient],
  )

  const revalidateInBackground = useCallback(() => {
    if (!useAuthSessionStore.getState().validated) return
    if (backgroundCheck.current) return
    const check = verify(true)
    backgroundCheck.current = check
    void check.finally(() => {
      if (backgroundCheck.current === check) backgroundCheck.current = null
    })
  }, [verify])

  useEffect(() => {
    const sequence = checkSequence.current
    active.current = true
    useAuthSessionStore.getState().hydrate()
    setSupportWidgetIdentityReady(false)
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel(CHANNEL)
      channel.current.onmessage = () => {
        isolateSupportWidgetSession()
        ++mutationSequence.current
        ++checkSequence.current
        isolate()
        void verify()
      }
    }
    const onFocus = () => {
      revalidateInBackground()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') revalidateInBackground()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    queueMicrotask(() => {
      if (active.current) void verify(false, true)
    })
    return () => {
      active.current = false
      checkSequence.current = sequence + 1
      channel.current?.close()
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isolate, revalidateInBackground, verify])

  const establishSession = useCallback(
    async (nextUser: CurrentUser) => {
      ++checkSequence.current
      isolate()
      const generation = captureAuthSessionGeneration()
      const mutation = mutationSequence.current
      try {
        const verified = await api.getCurrentUser('')
        if (
          !active.current ||
          generation !== captureAuthSessionGeneration() ||
          mutation !== mutationSequence.current
        )
          throw new Error('Stale session establishment')
        if (
          verified.email !== nextUser.email ||
          verified.sessionVersion !== nextUser.sessionVersion
        )
          throw new Error('Session identity changed')
        useAuthSessionStore
          .getState()
          .setAccessToken(crypto.randomUUID(), verified.sessionVersion)
        useAuthSessionStore.getState().setValidated(true)
        userRef.current = verified
        setSupportWidgetIdentityReady(true)
        versionRef.current = verified.sessionVersion ?? null
        queryClient.setQueryData(authQueryKeys.me, verified)
        setUser(verified)
        setReady(true)
        setError(null)
        notify()
        return verified
      } catch (cause) {
        if (generation === captureAuthSessionGeneration()) {
          isolate()
          setError(cause)
          setReady(true)
          notify()
        }
        throw cause
      }
    },
    [api, isolate, notify, queryClient],
  )

  const signIn = useCallback(
    async (input: Parameters<AuthContextValue['signIn']>[0]) => {
      const mutation = ++mutationSequence.current
      ++checkSequence.current
      isolate()
      try {
        const result = await api.login(input)
        if (mutation !== mutationSequence.current)
          throw new Error('Stale login response')
        return await establishSession(result)
      } catch (cause) {
        if (active.current && mutation === mutationSequence.current) {
          // A concurrent auth response may have changed the fixed browser cookie.
          void verify()
        }
        throw cause
      }
    },
    [api, establishSession, isolate, verify],
  )

  const logout = useCallback(() => {
    const mutation = ++mutationSequence.current
    ++checkSequence.current
    isolate()
    setChecking(true)
    notify()
    void (api.logout?.() ?? Promise.resolve()).then(
      () => {
        if (!active.current || mutation !== mutationSequence.current) return
        setChecking(false)
        setReady(true)
        notify()
        void verify()
      },
      (cause) => {
        if (active.current && mutation === mutationSequence.current) {
          pauseForVerification(cause)
          setChecking(false)
          void verify()
        }
      },
    )
  }, [api, isolate, notify, pauseForVerification, verify])

  const sessionInvalidated = useCallback(() => {
    ++checkSequence.current
    isolate()
    notify()
    void verify()
  }, [isolate, notify, verify])

  let status: AuthStatus = 'unknown'
  if (ready && !checking)
    status = error ? 'error' : user ? 'authenticated' : 'unauthenticated'
  else if (ready) status = 'bootstrapping'

  return (
    <AuthContext
      value={{
        status,
        currentUser: status === 'authenticated' ? user : null,
        bootstrapError: error,
        establishSession,
        signIn,
        retryBootstrap: () => {
          void verify()
        },
        logout,
        sessionInvalidated,
      }}
    >
      {children}
    </AuthContext>
  )
}
