import { describe, expect, it } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'
import { hasExactPendingMutation } from '@/features/referrals/financial-mutation-pending'
import { referralsMutationKeys } from '@/features/referrals/referrals-queries'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('Financial mutation pending gate', () => {
  it('matches only the exact pending mutation key without inspecting variables', async () => {
    const queryClient = createQueryClient()
    const pending = deferred<true>()
    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: referralsMutationKeys.withdrawalRequest,
      mutationFn: () => pending.promise,
      retry: false,
    })

    const request = mutation.execute({ privateAccount: 'not-inspected' })

    expect(
      hasExactPendingMutation(
        queryClient,
        referralsMutationKeys.withdrawalRequest,
      ),
    ).toBe(true)
    expect(
      hasExactPendingMutation(
        queryClient,
        referralsMutationKeys.commissionTransfer,
      ),
    ).toBe(false)
    expect(hasExactPendingMutation(queryClient, ['referrals'])).toBe(false)

    pending.resolve(true)
    await request
    expect(
      hasExactPendingMutation(
        queryClient,
        referralsMutationKeys.withdrawalRequest,
      ),
    ).toBe(false)
  })
})
