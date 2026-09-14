import { useSyncExternalStore } from 'react'

export const financialOperationKeys = {
  commissionTransfer: 'commission-transfer',
  withdrawalRequest: 'withdrawal-request',
} as const

export type FinancialOperationKey =
  (typeof financialOperationKeys)[keyof typeof financialOperationKeys]

export interface FinancialAttemptHandle {
  readonly operationKey: FinancialOperationKey
  readonly attempt: symbol
}

const activeAttempts = new Map<FinancialOperationKey, FinancialAttemptHandle>()
const listeners = new Set<() => void>()

function emitChange() {
  for (const listener of listeners) listener()
}

export function tryBeginFinancialAttempt(
  operationKey: FinancialOperationKey,
): FinancialAttemptHandle | null {
  if (activeAttempts.has(operationKey)) return null
  const handle: FinancialAttemptHandle = {
    operationKey,
    attempt: Symbol(operationKey),
  }
  activeAttempts.set(operationKey, handle)
  emitChange()
  return handle
}

export function finishFinancialAttempt(handle: FinancialAttemptHandle) {
  if (activeAttempts.get(handle.operationKey) !== handle) return false
  activeAttempts.delete(handle.operationKey)
  emitChange()
  return true
}

export function hasRuntimeFinancialAttempt(
  operationKey: FinancialOperationKey,
) {
  return activeAttempts.has(operationKey)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRuntimeFinancialAttemptPending(
  operationKey: FinancialOperationKey,
) {
  return useSyncExternalStore(
    subscribe,
    () => hasRuntimeFinancialAttempt(operationKey),
    () => false,
  )
}

export function resetFinancialMutationRuntimeForTests() {
  if (activeAttempts.size === 0) return
  activeAttempts.clear()
  emitChange()
}
