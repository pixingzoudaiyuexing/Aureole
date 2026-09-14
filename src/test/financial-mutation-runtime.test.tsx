import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  financialOperationKeys,
  finishFinancialAttempt,
  hasRuntimeFinancialAttempt,
  tryBeginFinancialAttempt,
  useRuntimeFinancialAttemptPending,
} from '@/features/referrals/financial-mutation-runtime'

function PendingState() {
  const commissionPending = useRuntimeFinancialAttemptPending(
    financialOperationKeys.commissionTransfer,
  )
  return <output>{commissionPending ? 'pending' : 'idle'}</output>
}

describe('Financial mutation runtime registry', () => {
  it('keeps exact operations isolated and releases only the owning handle', () => {
    const commissionA = tryBeginFinancialAttempt(
      financialOperationKeys.commissionTransfer,
    )
    expect(commissionA).not.toBeNull()
    expect(
      tryBeginFinancialAttempt(financialOperationKeys.commissionTransfer),
    ).toBeNull()

    const withdrawal = tryBeginFinancialAttempt(
      financialOperationKeys.withdrawalRequest,
    )
    expect(withdrawal).not.toBeNull()
    expect(
      hasRuntimeFinancialAttempt(financialOperationKeys.commissionTransfer),
    ).toBe(true)
    expect(
      hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest),
    ).toBe(true)

    expect(finishFinancialAttempt(withdrawal!)).toBe(true)
    expect(finishFinancialAttempt(commissionA!)).toBe(true)
    const commissionB = tryBeginFinancialAttempt(
      financialOperationKeys.commissionTransfer,
    )
    expect(commissionB).not.toBeNull()

    expect(finishFinancialAttempt(commissionA!)).toBe(false)
    expect(
      hasRuntimeFinancialAttempt(financialOperationKeys.commissionTransfer),
    ).toBe(true)
    expect(finishFinancialAttempt(commissionB!)).toBe(true)
  })

  it('notifies React UI when runtime pending state changes', () => {
    render(<PendingState />)
    expect(screen.getByText('idle')).toBeInTheDocument()

    let attempt: ReturnType<typeof tryBeginFinancialAttempt>
    act(() => {
      attempt = tryBeginFinancialAttempt(
        financialOperationKeys.commissionTransfer,
      )
    })
    expect(screen.getByText('pending')).toBeInTheDocument()

    act(() => {
      finishFinancialAttempt(attempt!)
    })
    expect(screen.getByText('idle')).toBeInTheDocument()
  })
})
