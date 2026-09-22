import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api/client'
import {
  isErrorFromCurrentAuthSession,
  useAuthSessionStore,
} from '@/lib/auth/session-store'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('Auth session isolation', () => {
  it('marks a late 401 from session A as stale after session B becomes current', async () => {
    const response = deferred<Response>()
    const client = createApiClient({
      baseUrl: 'https://gateway.example',
      fetchImpl: vi.fn(() => response.promise),
    })
    useAuthSessionStore.setState({
      accessToken: 'session-a-token',
      sessionVersion: 'session-a',
      generation: 1,
      hydrated: true,
      validated: true,
    })
    const request = client.authenticatedRequest('/api/v1/me', {
      method: 'GET',
      accessToken: 'session-a-token',
    })

    useAuthSessionStore.setState({
      accessToken: 'session-b-token',
      sessionVersion: 'session-b',
      generation: 2,
      validated: true,
    })
    response.resolve(
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'AUTH_FAILED', message: 'Authentication failed' },
        }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    )

    const error = await request.catch((caught) => caught)
    expect(error).toMatchObject({ code: 'AUTH_FAILED' })
    expect(isErrorFromCurrentAuthSession(error)).toBe(false)
    expect(useAuthSessionStore.getState().accessToken).toBe('session-b-token')
  })

  it('does not attribute a newly-started old-token request to the current session', async () => {
    const client = createApiClient({
      baseUrl: 'https://gateway.example',
      fetchImpl: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: 'AUTH_FAILED', message: 'Authentication failed' },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      ),
    })
    useAuthSessionStore.setState({
      accessToken: 'session-b-token',
      sessionVersion: 'session-b',
      generation: 2,
      hydrated: true,
      validated: true,
    })

    const error = await client
      .authenticatedRequest('/api/v1/me', {
        method: 'GET',
        accessToken: 'session-a-token',
      })
      .catch((caught) => caught)

    expect(error).toMatchObject({ code: 'AUTH_FAILED' })
    expect(isErrorFromCurrentAuthSession(error)).toBe(false)
    expect(useAuthSessionStore.getState().accessToken).toBe('session-b-token')
  })

  it('keeps a detached old query result out of a recreated private key', async () => {
    const client = new QueryClient()
    const oldResult = deferred<{ owner: string }>()
    const oldRequest = client.fetchQuery({
      queryKey: ['private', 'fixed'],
      queryFn: () => oldResult.promise,
    })
    await client.cancelQueries()
    client.clear()
    await client.fetchQuery({
      queryKey: ['private', 'fixed'],
      queryFn: async () => ({ owner: 'session-b' }),
    })

    oldResult.resolve({ owner: 'session-a' })
    await expect(oldRequest).rejects.toBeDefined()
    expect(client.getQueryData(['private', 'fixed'])).toEqual({
      owner: 'session-b',
    })
  })
})
