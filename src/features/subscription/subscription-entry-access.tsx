import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ReadError } from '@/components/shared/read-error'
import { isInvalidSessionError } from '@/features/auth/auth-errors'
import { useExitOnInvalidSessionError } from '@/features/auth/use-exit-on-invalid-session-error'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { ApiError } from '@/lib/api/errors'
import {
  SubscriptionAccessLinkRuntime,
  type SubscriptionAccessLinkRuntimeHandle,
} from './subscription-access-link-runtime'
import { SubscriptionAccessPanel } from './subscription-access-panel'
import type {
  SubscriptionDeliveryEntry,
  SubscriptionDeliveryOptions,
  SubscriptionInfoMode,
} from './subscription-api'
import type { SubscriptionMutationCoordinator } from './subscription-mutation-coordinator'
import {
  subscriptionDeliveryOptionsQueryOptions,
  subscriptionQueryKeys,
  useSubscriptionDeliveryOptions,
} from './subscription-queries'
import {
  clearSelectedSubscriptionEntry,
  readSelectedSubscriptionEntry,
  writeSelectedSubscriptionEntry,
} from './subscription-selection-storage'

interface EntrySelectionState {
  selectedEntryId: string | null
  requiresReselection: boolean
}

function isApiCode(error: unknown, code: string) {
  return error instanceof ApiError && error.code === code
}

function initialEntrySelection(
  options: SubscriptionDeliveryOptions,
): EntrySelectionState {
  const persisted = readSelectedSubscriptionEntry()
  if (options.entries.length === 0) {
    clearSelectedSubscriptionEntry()
    return { selectedEntryId: null, requiresReselection: false }
  }
  if (persisted && options.entries.some((entry) => entry.id === persisted)) {
    return { selectedEntryId: persisted, requiresReselection: false }
  }
  if (persisted) {
    clearSelectedSubscriptionEntry()
  }
  if (options.defaultEntryId !== null) {
    writeSelectedSubscriptionEntry(options.defaultEntryId)
    return {
      selectedEntryId: options.defaultEntryId,
      requiresReselection: false,
    }
  }
  return { selectedEntryId: null, requiresReselection: false }
}

export function SubscriptionEntryAccess({
  accessToken,
  mutationCoordinator,
}: {
  accessToken: string
  mutationCoordinator: SubscriptionMutationCoordinator
}) {
  const deliveryOptions = useSubscriptionDeliveryOptions(accessToken)
  const invalidSessionError = isInvalidSessionError(deliveryOptions.error)
    ? deliveryOptions.error
    : null
  useExitOnInvalidSessionError(invalidSessionError)

  if (invalidSessionError) return null
  if (deliveryOptions.isPending) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        正在读取订阅入口…
      </p>
    )
  }
  if (deliveryOptions.isError && !deliveryOptions.data) {
    if (isApiCode(deliveryOptions.error, 'SUBSCRIPTION_ACCESS_UNAVAILABLE')) {
      return (
        <p className="text-sm text-muted-foreground">
          当前没有可展示的订阅地址。
        </p>
      )
    }
    return (
      <ReadError
        message="暂时无法读取订阅入口。"
        error={deliveryOptions.error}
        retry={() => void deliveryOptions.refetch()}
      />
    )
  }

  return (
    <SubscriptionEntryAccessReady
      accessToken={accessToken}
      options={deliveryOptions.data ?? { defaultEntryId: null, entries: [] }}
      mutationCoordinator={mutationCoordinator}
    />
  )
}

function SubscriptionEntryAccessReady({
  accessToken,
  options,
  mutationCoordinator,
}: {
  accessToken: string
  options: SubscriptionDeliveryOptions
  mutationCoordinator: SubscriptionMutationCoordinator
}) {
  const queryClient = useQueryClient()
  const sessionGeneration = useAuthSessionStore((state) => state.generation)
  const accessRuntimeRef = useRef<SubscriptionAccessLinkRuntimeHandle>(null)
  const [selection, setSelection] = useState<EntrySelectionState>(() =>
    initialEntrySelection(options),
  )
  const [subscriptionInfo, setSubscriptionInfo] =
    useState<SubscriptionInfoMode>('show')
  const [availability, setAvailability] = useState<{
    identity: string
    available: boolean
  } | null>(null)
  const [reselectionRefreshing, setReselectionRefreshing] = useState(false)
  const [reselectionRefreshError, setReselectionRefreshError] =
    useState<unknown>(null)

  const selectedEntryId =
    selection.selectedEntryId !== null &&
    options.entries.some((entry) => entry.id === selection.selectedEntryId)
      ? selection.selectedEntryId
      : null
  const runtimeIdentity = selectedEntryId
    ? `${sessionGeneration}:${selectedEntryId}:${subscriptionInfo}`
    : null

  const refreshOptionsForReselection = useCallback(async () => {
    setReselectionRefreshing(true)
    setReselectionRefreshError(null)
    await queryClient.invalidateQueries({
      queryKey: subscriptionQueryKeys.deliveryOptions,
      exact: true,
      refetchType: 'none',
    })
    try {
      await queryClient.fetchQuery({
        ...subscriptionDeliveryOptionsQueryOptions(accessToken),
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
    (entryId: string, refreshOptions: boolean) => {
      if (selection.selectedEntryId !== entryId) return
      accessRuntimeRef.current?.suppress()
      clearSelectedSubscriptionEntry()
      setAvailability(null)
      setSelection({ selectedEntryId: null, requiresReselection: true })
      if (refreshOptions) void refreshOptionsForReselection()
    },
    [refreshOptionsForReselection, selection.selectedEntryId],
  )

  useEffect(() => {
    const selected = selection.selectedEntryId
    if (!selected || options.entries.some((entry) => entry.id === selected)) {
      return
    }
    queueMicrotask(() => requireReselection(selected, false))
  }, [options.entries, requireReselection, selection.selectedEntryId])

  const selectEntry = (entryId: string) => {
    if (!options.entries.some((entry) => entry.id === entryId)) return
    accessRuntimeRef.current?.suppress()
    setAvailability(null)
    setReselectionRefreshError(null)
    writeSelectedSubscriptionEntry(entryId)
    setSelection({ selectedEntryId: entryId, requiresReselection: false })
  }

  const changeSubscriptionInfo = (mode: SubscriptionInfoMode) => {
    if (mode === subscriptionInfo) return
    accessRuntimeRef.current?.suppress()
    setAvailability(null)
    setSubscriptionInfo(mode)
  }

  const refreshSelectedAccess = useCallback(async () => {
    const runtime = accessRuntimeRef.current
    if (!runtime || selectedEntryId === null) {
      throw new Error('No subscription delivery entry selected')
    }
    await runtime.refresh({ suppressError: true })
  }, [selectedEntryId])

  const suppressSelectedAccess = useCallback(() => {
    accessRuntimeRef.current?.suppress()
    setAvailability(null)
  }, [])

  const handleAvailabilityChange = useCallback(
    (identity: string, available: boolean) => {
      setAvailability({ identity, available })
    },
    [],
  )

  const handleEntryUnavailable = useCallback(
    (entryId: string) => requireReselection(entryId, true),
    [requireReselection],
  )

  const invalidSessionError = isInvalidSessionError(reselectionRefreshError)
    ? reselectionRefreshError
    : null
  useExitOnInvalidSessionError(invalidSessionError)
  if (invalidSessionError) return null

  const selectionLocked = mutationCoordinator.activeAction !== null
  const requiresReselection =
    selection.requiresReselection ||
    (selection.selectedEntryId !== null && selectedEntryId === null)
  const accessAvailable =
    runtimeIdentity !== null &&
    availability?.identity === runtimeIdentity &&
    availability.available

  return (
    <div className="space-y-5">
      <EntrySelectionControl
        entries={options.entries}
        selectedEntryId={selectedEntryId}
        requiresReselection={requiresReselection}
        disabled={selectionLocked}
        refreshing={reselectionRefreshing}
        refreshError={reselectionRefreshError}
        onRefresh={() => void refreshOptionsForReselection()}
        onSelect={selectEntry}
      />

      {selectedEntryId ? (
        <SubscriptionInfoControl
          value={subscriptionInfo}
          disabled={selectionLocked}
          onChange={changeSubscriptionInfo}
        />
      ) : null}

      <SubscriptionAccessPanel
        accessContent={
          selectedEntryId && runtimeIdentity ? (
            <SubscriptionAccessLinkRuntime
              key={runtimeIdentity}
              ref={accessRuntimeRef}
              accessToken={accessToken}
              sessionGeneration={sessionGeneration}
              entryId={selectedEntryId}
              subscriptionInfo={subscriptionInfo}
              runtimeIdentity={runtimeIdentity}
              onAvailabilityChange={handleAvailabilityChange}
              onEntryUnavailable={handleEntryUnavailable}
            />
          ) : null
        }
        accessAvailable={accessAvailable}
        accessToken={accessToken}
        mutationCoordinator={mutationCoordinator}
        refreshAccess={refreshSelectedAccess}
        suppressAccess={suppressSelectedAccess}
        canRecoverAccess={selectedEntryId !== null}
      />
    </div>
  )
}

function EntrySelectionControl({
  entries,
  selectedEntryId,
  requiresReselection,
  disabled,
  refreshing,
  refreshError,
  onRefresh,
  onSelect,
}: {
  entries: SubscriptionDeliveryEntry[]
  selectedEntryId: string | null
  requiresReselection: boolean
  disabled: boolean
  refreshing: boolean
  refreshError: unknown
  onRefresh: () => void
  onSelect: (entryId: string) => void
}) {
  if (requiresReselection) {
    return (
      <div className="space-y-4" role="alert">
        <p className="text-sm font-semibold">原订阅入口已不可用，请重新选择</p>
        {refreshing ? (
          <p className="text-sm text-muted-foreground" role="status">
            正在刷新订阅入口…
          </p>
        ) : refreshError ? (
          <ReadError
            message="暂时无法刷新订阅入口。"
            error={refreshError}
            retry={onRefresh}
          />
        ) : entries.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              暂无可重新选择的订阅入口。
            </p>
            <Button type="button" variant="outline" onClick={onRefresh}>
              重新读取订阅入口
            </Button>
          </div>
        ) : (
          <EntryChoices
            entries={entries}
            disabled={disabled}
            onSelect={onSelect}
          />
        )}
      </div>
    )
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无可用订阅入口</p>
  }

  if (selectedEntryId === null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">请选择订阅入口。</p>
        <EntryChoices
          entries={entries}
          disabled={disabled}
          onSelect={onSelect}
        />
      </div>
    )
  }

  if (entries.length === 1) {
    return (
      <div>
        <p className="text-sm font-semibold">订阅入口</p>
        <p className="mt-1 text-sm">{entries[0]!.label}</p>
      </div>
    )
  }

  return (
    <label className="block max-w-xl">
      <span className="text-sm font-semibold">订阅入口</span>
      <select
        aria-label="订阅入口"
        className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        value={selectedEntryId}
        disabled={disabled}
        onChange={(event) => onSelect(event.target.value)}
      >
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function EntryChoices({
  entries,
  disabled,
  onSelect,
}: {
  entries: SubscriptionDeliveryEntry[]
  disabled: boolean
  onSelect: (entryId: string) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map((entry) => (
        <div key={entry.id} className="border-l-2 border-border pl-3">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onSelect(entry.id)}
          >
            {entry.label}
          </Button>
        </div>
      ))}
    </div>
  )
}

function SubscriptionInfoControl({
  value,
  disabled,
  onChange,
}: {
  value: SubscriptionInfoMode
  disabled: boolean
  onChange: (mode: SubscriptionInfoMode) => void
}) {
  return (
    <div>
      <p className="text-sm font-semibold">订阅信息</p>
      <div
        className="mt-2 inline-flex rounded-md border border-border bg-background p-0.5"
        role="group"
        aria-label="订阅信息"
      >
        {(['show', 'hide'] as const).map((mode) => (
          <Button
            key={mode}
            type="button"
            variant="ghost"
            size="sm"
            className={
              value === mode ? 'bg-secondary text-foreground' : undefined
            }
            aria-pressed={value === mode}
            disabled={disabled}
            onClick={() => onChange(mode)}
          >
            {mode === 'show' ? '显示订阅信息' : '隐藏订阅信息'}
          </Button>
        ))}
      </div>
    </div>
  )
}
