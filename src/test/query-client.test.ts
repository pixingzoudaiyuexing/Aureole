import { MutationObserver } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'

describe('QueryClient mutation baseline', () => {
  it('does not retry a rejected mutation globally', async () => {
    const queryClient = createQueryClient()
    const mutationFn = vi.fn().mockRejectedValue(new Error('mutation failed'))
    const observer = new MutationObserver(queryClient, { mutationFn })

    await expect(observer.mutate(undefined)).rejects.toThrow('mutation failed')
    expect(mutationFn).toHaveBeenCalledTimes(1)

    queryClient.clear()
  })
})
