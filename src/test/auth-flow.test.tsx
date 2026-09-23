import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'
import { AuthProvider } from '@/features/auth/auth-provider'
import { useAuth } from '@/features/auth/auth-context'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { authQueryKeys } from '@/features/auth/auth-query-keys'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { sessionSafetyStorageKeys } from '@/lib/auth/session-safety-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const member: CurrentUser = {
  email: 'member@example.com',
  status: 'active',
  expiresAt: null,
}
const other: CurrentUser = { ...member, email: 'other@example.com' }
const missing = () =>
  new ApiError({
    status: 401,
    code: 'AUTH_REQUIRED',
    message: 'Authentication required',
  })
const unavailable = () =>
  new ApiError({
    status: 504,
    code: 'UPSTREAM_TIMEOUT',
    message: 'Temporarily unavailable',
  })

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function Harness() {
  const { status, currentUser, signIn, logout, retryBootstrap } = useAuth()
  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="user">{currentUser?.email ?? 'none'}</output>
      <button
        onClick={() => {
          void signIn({ email: other.email, password: 'password123' }).catch(
            () => undefined,
          )
        }}
      >
        login
      </button>
      <button onClick={logout}>logout</button>
      <button onClick={retryBootstrap}>retry</button>
    </div>
  )
}

function renderSession(api: AuthApi) {
  const queryClient = createQueryClient()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={api}>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return { queryClient, ...view }
}

describe('Cookie session UI', () => {
  it('restores an existing server session without reading the legacy bearer', async () => {
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'old-bearer')
    const getCurrentUser = vi.fn().mockResolvedValue(member)
    renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(screen.getByTestId('user')).toHaveTextContent(member.email)
    expect(getCurrentUser).toHaveBeenCalledWith('')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(useAuthSessionStore.getState().accessToken).not.toBe('old-bearer')
  })

  it('isolates private Query and preserves tab-local financial uncertainty on account switch', async () => {
    let current = member
    const api: AuthApi = {
      login: vi.fn().mockImplementation(async () => {
        current = other
        return other
      }),
      getCurrentUser: vi.fn(async () => current),
    }
    window.sessionStorage.setItem(
      sessionSafetyStorageKeys.withdrawalRequestUncertainty,
      'acknowledged',
    )
    const { queryClient } = renderSession(api)
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    queryClient.setQueryData(['private'], { email: member.email })
    await userEvent.setup().click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
    expect(
      window.sessionStorage.getItem(
        sessionSafetyStorageKeys.withdrawalRequestUncertainty,
      ),
    ).toBe('active')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('never restores an old /me result after switching identities', async () => {
    const old = deferred<CurrentUser>()
    let current = member
    const getCurrentUser = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementation(async () => current)
    const api: AuthApi = {
      login: vi.fn().mockImplementation(async () => {
        current = other
        return other
      }),
      getCurrentUser,
    }
    const { queryClient } = renderSession(api)
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1))
    await userEvent.setup().click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    await act(async () => {
      old.resolve(member)
      await old.promise
    })
    expect(screen.getByTestId('user')).toHaveTextContent(other.email)
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })

  it('does not repopulate the active me Query from an old in-flight read', async () => {
    const oldRead = deferred<CurrentUser>()
    let current = member
    const getCurrentUser = vi.fn(async () => current)
    const { queryClient } = renderSession({
      login: vi.fn(async () => {
        current = other
        return other
      }),
      getCurrentUser,
    })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    getCurrentUser.mockImplementationOnce(() => oldRead.promise)
    const oldQuery = queryClient.refetchQueries(
      { queryKey: authQueryKeys.me, exact: true, type: 'active' },
      { cancelRefetch: false },
    )
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(3))
    await userEvent.setup().click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    await act(async () => {
      oldRead.resolve(member)
      await oldQuery
    })
    expect(queryClient.getQueryData(authQueryKeys.me)).toMatchObject({
      email: other.email,
    })
    expect(screen.getByTestId('user')).toHaveTextContent(other.email)
  })

  it('does not interpret a temporary /me failure as confirmed logout', async () => {
    const getCurrentUser = vi
      .fn()
      .mockRejectedValueOnce(unavailable())
      .mockResolvedValue(member)
    renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
  })

  it('keeps an established page mounted during one deduplicated focus verification', async () => {
    const pending = deferred<CurrentUser>()
    const getCurrentUser = vi.fn().mockResolvedValue(member)
    const { queryClient } = renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    const identity = useAuthSessionStore.getState().accessToken
    queryClient.setQueryData(['private'], { owner: member.email })
    const initialCalls = getCurrentUser.mock.calls.length
    getCurrentUser.mockImplementationOnce(() => pending.promise)
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(getCurrentUser).toHaveBeenCalledTimes(initialCalls + 1)
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent(member.email)
    expect(queryClient.getQueryData(['private'])).toEqual({
      owner: member.email,
    })
    await act(async () => {
      pending.resolve(member)
      await pending.promise
    })
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(useAuthSessionStore.getState().accessToken).toBe(identity)
    expect(getCurrentUser).toHaveBeenCalledTimes(initialCalls + 1)
  })

  it('does not unload established UI on a transient background failure', async () => {
    const pending = deferred<CurrentUser>()
    const getCurrentUser = vi.fn().mockResolvedValue(member)
    const { queryClient } = renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    const identity = useAuthSessionStore.getState().accessToken
    queryClient.setQueryData(['private'], { owner: member.email })
    getCurrentUser.mockImplementationOnce(() => pending.promise)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    await act(async () => {
      pending.reject(unavailable())
      await pending.promise.catch(() => undefined)
    })
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(useAuthSessionStore.getState().accessToken).toBe(identity)
    expect(queryClient.getQueryData(['private'])).toEqual({
      owner: member.email,
    })
  })

  it('discards an old focus result after a cross-tab identity switch', async () => {
    class TestChannel {
      onmessage: (() => void) | null = null
      postMessage() {}
      close() {}
    }
    const channels: TestChannel[] = []
    vi.stubGlobal(
      'BroadcastChannel',
      class extends TestChannel {
        constructor() {
          super()
          channels.push(this)
        }
      },
    )
    const old = deferred<CurrentUser>()
    let current = member
    const getCurrentUser = vi.fn(async () => current)
    const { queryClient } = renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    getCurrentUser.mockImplementationOnce(() => old.promise)
    act(() => window.dispatchEvent(new Event('focus')))
    current = other
    await act(async () => channels[0]?.onmessage?.())
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    queryClient.setQueryData(['private'], { owner: other.email })
    await act(async () => {
      old.resolve(member)
      await old.promise
    })
    expect(screen.getByTestId('user')).toHaveTextContent(other.email)
    expect(queryClient.getQueryData(['private'])).toEqual({
      owner: other.email,
    })
    vi.unstubAllGlobals()
  })

  it('does not start a focus read while an explicit account switch is pending', async () => {
    const login = deferred<CurrentUser>()
    const getCurrentUser = vi.fn().mockResolvedValue(member)
    renderSession({ login: vi.fn(() => login.promise), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    const initialCalls = getCurrentUser.mock.calls.length
    await userEvent.setup().click(screen.getByRole('button', { name: 'login' }))
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(getCurrentUser).toHaveBeenCalledTimes(initialCalls)
    await act(async () => {
      login.resolve(other)
      await login.promise
    })
  })

  it('does not restore a late pre-logout /me response', async () => {
    const pending = deferred<CurrentUser>()
    const getCurrentUser = vi
      .fn()
      .mockImplementationOnce(() => pending.promise)
      .mockRejectedValue(missing())
    const logout = vi.fn().mockResolvedValue(undefined)
    renderSession({ login: vi.fn(), getCurrentUser, logout })
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(1))
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'logout' }))
    await act(async () => {
      pending.resolve(member)
      await pending.promise
    })
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'),
    )
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(logout).toHaveBeenCalledOnce()
  })

  it('does not let an old logout completion override a newer login', async () => {
    const pendingLogout = deferred<void>()
    let current: CurrentUser | null = member
    const api: AuthApi = {
      login: vi.fn(async () => {
        current = other
        return other
      }),
      logout: vi.fn(() => pendingLogout.promise),
      getCurrentUser: vi.fn(async () => {
        if (!current) throw missing()
        return current
      }),
    }
    renderSession(api)
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'logout' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    await act(async () => {
      pendingLogout.resolve()
      await pendingLogout.promise
    })
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent(other.email)
  })

  it('does not let an old logout completion override a cross-tab identity refresh', async () => {
    class TestChannel {
      onmessage: (() => void) | null = null
      postMessage() {}
      close() {}
    }
    const channels: TestChannel[] = []
    vi.stubGlobal(
      'BroadcastChannel',
      class extends TestChannel {
        constructor() {
          super()
          channels.push(this)
        }
      },
    )
    const pendingLogout = deferred<void>()
    let current = member
    const { queryClient } = renderSession({
      login: vi.fn(),
      logout: vi.fn(() => pendingLogout.promise),
      getCurrentUser: vi.fn(async () => current),
    })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'logout' }))
    current = other
    await act(async () => {
      channels[0]?.onmessage?.()
    })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    queryClient.setQueryData(['private'], { owner: other.email })
    await act(async () => {
      pendingLogout.resolve()
      await pendingLogout.promise
    })
    expect(screen.getByTestId('user')).toHaveTextContent(other.email)
    expect(queryClient.getQueryData(['private'])).toEqual({
      owner: other.email,
    })
    vi.unstubAllGlobals()
  })

  it('keeps the latest identity when an older login resolves late', async () => {
    const old = deferred<CurrentUser>()
    let current = member
    const login = vi
      .fn()
      .mockImplementationOnce(() => old.promise)
      .mockImplementation(async () => {
        current = other
        return other
      })
    renderSession({ login, getCurrentUser: vi.fn(async () => current) })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'login' }))
    await user.click(screen.getByRole('button', { name: 'login' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    await act(async () => {
      old.resolve(member)
      await old.promise
    })
    expect(screen.getByTestId('user')).toHaveTextContent(other.email)
  })

  it('retains the established session and private page after a transient focus error', async () => {
    let fail = false
    const getCurrentUser = vi.fn(async () => {
      if (fail) throw unavailable()
      return member
    })
    const { queryClient } = renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    const identity = useAuthSessionStore.getState().accessToken
    queryClient.setQueryData(['private'], { email: member.email })
    fail = true
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalledTimes(3))
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated')
    expect(screen.getByTestId('user')).toHaveTextContent(member.email)
    expect(useAuthSessionStore.getState().accessToken).toBe(identity)
    expect(queryClient.getQueryData(['private'])).toEqual({
      email: member.email,
    })
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
  })

  it('isolates confirmed invalidation during background verification', async () => {
    const pending = deferred<CurrentUser>()
    const getCurrentUser = vi.fn().mockResolvedValue(member)
    const { queryClient } = renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    queryClient.setQueryData(['private'], { owner: member.email })
    getCurrentUser.mockImplementationOnce(() => pending.promise)
    act(() => window.dispatchEvent(new Event('focus')))
    await act(async () => {
      pending.reject(missing())
      await pending.promise.catch(() => undefined)
    })
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated')
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })

  it('isolates a changing server session between verification reads and recovers on retry', async () => {
    const first = {
      ...member,
      sessionVersion: '11111111-1111-4111-8111-111111111111',
    }
    const second = {
      ...other,
      sessionVersion: '22222222-2222-4222-8222-222222222222',
    }
    const getCurrentUser = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValue(second)
    const { queryClient } = renderSession({ login: vi.fn(), getCurrentUser })
    queryClient.setQueryData(['private'], { owner: first.email })
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('error'),
    )
    expect(screen.getByTestId('user')).toHaveTextContent('none')
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
    await userEvent.setup().click(screen.getByRole('button', { name: 'retry' }))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(second.email),
    )
  })

  it('revalidates on focus and isolates a switched account', async () => {
    let current = member
    const getCurrentUser = vi.fn(async () => current)
    const { queryClient } = renderSession({ login: vi.fn(), getCurrentUser })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    queryClient.setQueryData(['private'], { email: member.email })
    current = other
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(other.email),
    )
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })

  it('isolates private Query when the same account changes server session', async () => {
    let current = {
      ...member,
      sessionVersion: '11111111-1111-4111-8111-111111111111',
    }
    const { queryClient } = renderSession({
      login: vi.fn(),
      getCurrentUser: vi.fn(async () => current),
    })
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent(member.email),
    )
    const firstIdentity = useAuthSessionStore.getState().accessToken
    queryClient.setQueryData(['private'], {
      email: member.email,
      version: 'old',
    })
    current = {
      ...member,
      sessionVersion: '22222222-2222-4222-8222-222222222222',
    }
    act(() => window.dispatchEvent(new Event('focus')))
    await waitFor(() =>
      expect(useAuthSessionStore.getState().sessionVersion).toBe(
        current.sessionVersion,
      ),
    )
    expect(useAuthSessionStore.getState().accessToken).not.toBe(firstIdentity)
    expect(queryClient.getQueryData(['private'])).toBeUndefined()
  })
})
