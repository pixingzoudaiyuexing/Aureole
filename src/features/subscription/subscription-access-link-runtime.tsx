import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import {
  isCurrentAuthSessionGeneration,
  useAuthSessionStore,
} from '@/lib/auth/session-store'
import { ApiError } from '@/lib/api/errors'
import { SubscriptionCredential } from './subscription-access'
import { subscriptionApi } from './subscription-api'

export interface SubscriptionAccessLinkRuntimeHandle {
  refresh: (options?: { suppressError?: boolean }) => Promise<void>
  suppress: () => void
}

type AccessLinkState =
  | { status: 'pending'; accessUrl: null; error: null }
  | { status: 'success'; accessUrl: string; error: null }
  | { status: 'error'; accessUrl: null; error: unknown }
  | { status: 'idle'; accessUrl: null; error: null }

function isApiCode(error: unknown, code: string) {
  return error instanceof ApiError && error.code === code
}

export const SubscriptionAccessLinkRuntime = forwardRef<
  SubscriptionAccessLinkRuntimeHandle,
  {
    accessToken: string
    sessionGeneration: number
    entryId: string
    runtimeIdentity: string
    onAvailabilityChange: (identity: string, available: boolean) => void
    onEntryUnavailable: (entryId: string) => void
  }
>(function SubscriptionAccessLinkRuntime(
  {
    accessToken,
    sessionGeneration,
    entryId,
    runtimeIdentity,
    onAvailabilityChange,
    onEntryUnavailable,
  },
  ref,
) {
  const mountedRef = useRef(true)
  const requestGenerationRef = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<AccessLinkState>({
    status: 'idle',
    accessUrl: null,
    error: null,
  })

  const suppress = useCallback(() => {
    requestGenerationRef.current += 1
    controllerRef.current?.abort()
    controllerRef.current = null
    onAvailabilityChange(runtimeIdentity, false)
    setState({ status: 'idle', accessUrl: null, error: null })
  }, [onAvailabilityChange, runtimeIdentity])

  const refresh = useCallback(
    async (options?: { suppressError?: boolean }) => {
      const requestGeneration = requestGenerationRef.current + 1
      requestGenerationRef.current = requestGeneration
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      onAvailabilityChange(runtimeIdentity, false)
      setState({ status: 'pending', accessUrl: null, error: null })

      const requestInput = {
        entryId,
        profileId: 'default' as const,
        subscriptionInfo: 'show' as const,
      }

      try {
        const result = await subscriptionApi.getAccessLink(
          accessToken,
          requestInput,
          controller.signal,
        )
        const currentSession = useAuthSessionStore.getState()
        if (
          !mountedRef.current ||
          controller.signal.aborted ||
          requestGenerationRef.current !== requestGeneration ||
          currentSession.accessToken !== accessToken ||
          currentSession.generation !== sessionGeneration ||
          !isCurrentAuthSessionGeneration(sessionGeneration)
        ) {
          throw new Error('Stale subscription access-link result')
        }

        setState({
          status: 'success',
          accessUrl: result.accessUrl,
          error: null,
        })
        onAvailabilityChange(runtimeIdentity, true)
      } catch (error) {
        const currentSession = useAuthSessionStore.getState()
        const stale =
          !mountedRef.current ||
          controller.signal.aborted ||
          requestGenerationRef.current !== requestGeneration ||
          currentSession.accessToken !== accessToken ||
          currentSession.generation !== sessionGeneration

        if (stale) throw error

        setState(
          options?.suppressError && !isInvalidSessionError(error)
            ? { status: 'idle', accessUrl: null, error: null }
            : { status: 'error', accessUrl: null, error },
        )
        onAvailabilityChange(runtimeIdentity, false)
        if (isApiCode(error, 'SUBSCRIPTION_ENTRY_UNAVAILABLE')) {
          onEntryUnavailable(entryId)
        }
        throw error
      } finally {
        if (requestGenerationRef.current === requestGeneration) {
          controllerRef.current = null
        }
      }
    },
    [
      accessToken,
      entryId,
      onAvailabilityChange,
      onEntryUnavailable,
      runtimeIdentity,
      sessionGeneration,
    ],
  )

  useImperativeHandle(ref, () => ({ refresh, suppress }), [refresh, suppress])

  useEffect(() => {
    mountedRef.current = true
    let active = true
    queueMicrotask(() => {
      if (active) void refresh().catch(() => undefined)
    })

    return () => {
      active = false
      mountedRef.current = false
      requestGenerationRef.current += 1
      controllerRef.current?.abort()
      controllerRef.current = null
    }
  }, [refresh])

  useExitOnInvalidSessionError(state.status === 'error' ? state.error : null)

  if (state.status === 'success') {
    return (
      <SubscriptionCredential
        key={state.accessUrl}
        accessUrl={state.accessUrl}
      />
    )
  }
  if (state.status === 'pending') {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在读取订阅地址…
      </p>
    )
  }
  if (state.status === 'error') {
    if (isInvalidSessionError(state.error)) return null
    if (isApiCode(state.error, 'SUBSCRIPTION_ACCESS_UNAVAILABLE')) {
      return (
        <p className="text-sm text-muted-foreground">
          当前没有可展示的订阅地址。
        </p>
      )
    }
    if (isApiCode(state.error, 'SUBSCRIPTION_ENTRY_UNAVAILABLE')) return null
    return (
      <ReadError
        message="暂时无法读取订阅地址。"
        error={state.error}
        retry={() => void refresh().catch(() => undefined)}
      />
    )
  }
  return null
})
