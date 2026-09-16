import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { ApiError } from '@/lib/api/errors'
import { SubscriptionAccessPanel } from './subscription-access-panel'
import type { SubscriptionEntry } from './subscription-api'
import type { SubscriptionMutationCoordinator } from './subscription-mutation-coordinator'
import {
  subscriptionEntriesQueryOptions,
  subscriptionEntryAccessQueryOptions,
  subscriptionQueryKeys,
  useSubscriptionEntries,
} from './subscription-queries'
import {
  clearSelectedSubscriptionEntry,
  readSelectedSubscriptionEntry,
  writeSelectedSubscriptionEntry,
} from './subscription-selection-storage'

interface EntrySelectionState {
  selectedBaseUrl: string | null
  requiresReselection: boolean
}

function isApiCode(error: unknown, code: string) {
  return error instanceof ApiError && error.code === code
}

function initialEntrySelection(entries: SubscriptionEntry[]) {
  const persisted = readSelectedSubscriptionEntry()
  if (entries.length === 0) {
    clearSelectedSubscriptionEntry()
    return { selectedBaseUrl: null, requiresReselection: false }
  }
  if (persisted && entries.some((entry) => entry.baseUrl === persisted)) {
    return { selectedBaseUrl: persisted, requiresReselection: false }
  }
  if (persisted) {
    clearSelectedSubscriptionEntry()
    return { selectedBaseUrl: null, requiresReselection: true }
  }

  const firstBaseUrl = entries[0]!.baseUrl
  writeSelectedSubscriptionEntry(firstBaseUrl)
  return { selectedBaseUrl: firstBaseUrl, requiresReselection: false }
}

function entryDetail(baseUrl: string) {
  try {
    const url = new URL(baseUrl)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return null
  }
}

export function SubscriptionEntryAccess({
  accessToken,
  mutationCoordinator,
}: {
  accessToken: string
  mutationCoordinator: SubscriptionMutationCoordinator
}) {
  const entries = useSubscriptionEntries(accessToken)
  const invalidSessionError = isInvalidSessionError(entries.error)
    ? entries.error
    : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null
  if (entries.isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在读取订阅入口…
      </p>
    )
  }
  if (entries.isError && !entries.data) {
    if (isApiCode(entries.error, 'SUBSCRIPTION_ACCESS_UNAVAILABLE')) {
      return (
        <p className="text-sm text-muted-foreground">
          当前没有可展示的订阅地址。
        </p>
      )
    }
    return (
      <ReadError
        message="暂时无法读取订阅入口。"
        error={entries.error}
        retry={() => void entries.refetch()}
      />
    )
  }

  return (
    <SubscriptionEntryAccessReady
      accessToken={accessToken}
      entries={entries.data?.entries ?? []}
      mutationCoordinator={mutationCoordinator}
    />
  )
}

function SubscriptionEntryAccessReady({
  accessToken,
  entries,
  mutationCoordinator,
}: {
  accessToken: string
  entries: SubscriptionEntry[]
  mutationCoordinator: SubscriptionMutationCoordinator
}) {
  const queryClient = useQueryClient()
  const previousAccessKeyRef = useRef<{
    identity: string
    queryKey: readonly unknown[]
  } | null>(null)
  const requestVersionRef = useRef(0)
  const handledUnavailableRef = useRef<string | null>(null)
  const [selection, setSelection] = useState<EntrySelectionState>(() =>
    initialEntrySelection(entries),
  )
  const [requestVersion, setRequestVersion] = useState(0)
  const [credentialSuppressed, setCredentialSuppressed] = useState(false)
  const [refreshingAccess, setRefreshingAccess] = useState(false)
  const [refreshAccessError, setRefreshAccessError] = useState<unknown>(null)
  const [reselectionRefreshing, setReselectionRefreshing] = useState(false)
  const [reselectionRefreshError, setReselectionRefreshError] =
    useState<unknown>(null)

  const selectedBaseUrl = selection.selectedBaseUrl
  const accessQuery = useQuery({
    ...subscriptionEntryAccessQueryOptions(
      accessToken,
      selectedBaseUrl ?? '',
      requestVersion,
    ),
    enabled: selectedBaseUrl !== null,
  })

  useEffect(() => {
    const current = selectedBaseUrl
      ? {
          identity: `${requestVersion}:${selectedBaseUrl}`,
          queryKey: subscriptionQueryKeys.entryAccess(
            selectedBaseUrl,
            requestVersion,
          ),
        }
      : null
    const previous = previousAccessKeyRef.current
    if (previous && previous.identity !== current?.identity) {
      queryClient.removeQueries({ queryKey: previous.queryKey, exact: true })
    }
    previousAccessKeyRef.current = current
  }, [queryClient, requestVersion, selectedBaseUrl])

  const refreshEntriesForReselection = useCallback(async () => {
    setReselectionRefreshing(true)
    setReselectionRefreshError(null)
    await queryClient.invalidateQueries({
      queryKey: subscriptionQueryKeys.entries,
      exact: true,
      refetchType: 'none',
    })
    try {
      await queryClient.fetchQuery({
        ...subscriptionEntriesQueryOptions(accessToken),
        retry: false,
        staleTime: 0,
      })
    } catch (error) {
      setReselectionRefreshError(error)
    } finally {
      setReselectionRefreshing(false)
    }
  }, [accessToken, queryClient])

  const requireReselection = useCallback(
    (baseUrl: string, refreshEntries: boolean) => {
      void queryClient.cancelQueries({
        queryKey: ['subscription', 'entry-access', baseUrl],
      })
      clearSelectedSubscriptionEntry()
      setCredentialSuppressed(true)
      setSelection({
        selectedBaseUrl: null,
        requiresReselection: true,
      })
      if (refreshEntries) void refreshEntriesForReselection()
    },
    [queryClient, refreshEntriesForReselection],
  )

  useEffect(() => {
    if (
      !selectedBaseUrl ||
      !isApiCode(accessQuery.error, 'SUBSCRIPTION_ENTRY_UNAVAILABLE')
    ) {
      return
    }
    const identity = `${selectedBaseUrl}:${requestVersion}`
    if (handledUnavailableRef.current === identity) return
    handledUnavailableRef.current = identity
    // Query errors are external server state; this transition disables stale actions.
    requireReselection(selectedBaseUrl, true)
  }, [accessQuery.error, requestVersion, requireReselection, selectedBaseUrl])

  const selectEntry = (baseUrl: string) => {
    if (!entries.some((entry) => entry.baseUrl === baseUrl)) return
    if (selectedBaseUrl) {
      void queryClient.cancelQueries({
        queryKey: ['subscription', 'entry-access', selectedBaseUrl],
      })
    }
    handledUnavailableRef.current = null
    requestVersionRef.current += 1
    setRequestVersion(requestVersionRef.current)
    setCredentialSuppressed(false)
    setRefreshingAccess(false)
    setRefreshAccessError(null)
    setReselectionRefreshError(null)
    writeSelectedSubscriptionEntry(baseUrl)
    setSelection({
      selectedBaseUrl: baseUrl,
      requiresReselection: false,
    })
  }

  const refreshSelectedAccess = useCallback(async () => {
    if (!selectedBaseUrl) throw new Error('No subscription entry selected')
    setCredentialSuppressed(true)
    setRefreshingAccess(true)
    setRefreshAccessError(null)
    requestVersionRef.current += 1
    const nextVersion = requestVersionRef.current
    const nextQueryKey = subscriptionQueryKeys.entryAccess(
      selectedBaseUrl,
      nextVersion,
    )

    try {
      await queryClient.fetchQuery({
        ...subscriptionEntryAccessQueryOptions(
          accessToken,
          selectedBaseUrl,
          nextVersion,
        ),
        retry: false,
      })
      setRequestVersion(nextVersion)
      setRefreshingAccess(false)
      setCredentialSuppressed(false)
    } catch (error) {
      queryClient.removeQueries({ queryKey: nextQueryKey, exact: true })
      setRefreshingAccess(false)
      setRefreshAccessError(error)
      if (isApiCode(error, 'SUBSCRIPTION_ACCESS_UNAVAILABLE')) {
        return
      }
      if (isApiCode(error, 'SUBSCRIPTION_ENTRY_UNAVAILABLE')) {
        requireReselection(selectedBaseUrl, true)
      }
      throw error
    }
  }, [accessToken, queryClient, requireReselection, selectedBaseUrl])

  const invalidSessionError = isInvalidSessionError(refreshAccessError)
    ? refreshAccessError
    : isInvalidSessionError(accessQuery.error)
      ? accessQuery.error
      : isInvalidSessionError(reselectionRefreshError)
        ? reselectionRefreshError
        : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null
  const availableEntries = entries
  if (availableEntries.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无可用订阅入口</p>
  }

  if (selection.requiresReselection) {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-sm font-semibold">原订阅入口已不可用，请重新选择</p>
        {reselectionRefreshing ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在刷新订阅入口…
          </p>
        ) : reselectionRefreshError ? (
          <ReadError
            message="暂时无法刷新订阅入口。"
            error={reselectionRefreshError}
            retry={() => void refreshEntriesForReselection()}
          />
        ) : (
          <EntryChoices entries={availableEntries} onSelect={selectEntry} />
        )}
      </div>
    )
  }

  if (!selectedBaseUrl) return null

  const accessUnavailable = isApiCode(
    refreshAccessError ?? accessQuery.error,
    'SUBSCRIPTION_ACCESS_UNAVAILABLE',
  )
  const accessError = accessUnavailable
    ? null
    : (refreshAccessError ?? (accessQuery.isError ? accessQuery.error : null))
  const visibleAccessUrl = credentialSuppressed
    ? null
    : (accessQuery.data?.accessUrl ?? null)

  return (
    <div className="space-y-5">
      <EntrySelector
        entries={availableEntries}
        selectedBaseUrl={selectedBaseUrl}
        onSelect={selectEntry}
      />
      <SubscriptionAccessPanel
        key={selectedBaseUrl}
        accessUrl={visibleAccessUrl}
        accessPending={
          refreshingAccess || accessQuery.isPending || accessQuery.isFetching
        }
        accessUnavailable={accessUnavailable}
        accessError={accessError}
        accessToken={accessToken}
        mutationCoordinator={mutationCoordinator}
        refreshAccess={refreshSelectedAccess}
      />
    </div>
  )
}

function EntrySelector({
  entries,
  selectedBaseUrl,
  onSelect,
}: {
  entries: SubscriptionEntry[]
  selectedBaseUrl: string
  onSelect: (baseUrl: string) => void
}) {
  const selectedIndex = entries.findIndex(
    (entry) => entry.baseUrl === selectedBaseUrl,
  )
  const selectedDetail = entryDetail(selectedBaseUrl)

  if (entries.length === 1) {
    return (
      <div>
        <p className="text-sm font-semibold">订阅入口</p>
        <p className="mt-1 text-sm">入口 1</p>
        {selectedDetail ? (
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
            {selectedDetail}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <label className="block max-w-xl">
      <span className="text-sm font-semibold">订阅入口</span>
      <select
        aria-label="订阅入口"
        className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        value={selectedBaseUrl}
        onChange={(event) => onSelect(event.target.value)}
      >
        {entries.map((entry, index) => {
          const detail = entryDetail(entry.baseUrl)
          return (
            <option key={entry.baseUrl} value={entry.baseUrl}>
              {`入口 ${index + 1}${detail ? ` · ${detail}` : ''}`}
            </option>
          )
        })}
      </select>
      {selectedIndex >= 0 && selectedDetail ? (
        <span className="mt-2 block break-all font-mono text-xs text-muted-foreground">
          {selectedDetail}
        </span>
      ) : null}
    </label>
  )
}

function EntryChoices({
  entries,
  onSelect,
}: {
  entries: SubscriptionEntry[]
  onSelect: (baseUrl: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map((entry, index) => {
        const detail = entryDetail(entry.baseUrl)
        return (
          <div key={entry.baseUrl} className="border-l-2 border-border pl-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onSelect(entry.baseUrl)}
            >
              使用入口 {index + 1}
            </Button>
            {detail ? (
              <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                {detail}
              </p>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
