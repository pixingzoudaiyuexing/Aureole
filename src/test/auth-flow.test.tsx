import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type {
  AuthApi,
  CurrentUser,
  LoginResponse,
} from '@/features/auth/auth-api'
import { useAuth } from '@/features/auth/auth-context'
import { AuthProvider } from '@/features/auth/auth-provider'
import { authQueryKeys } from '@/features/auth/auth-query-keys'
import { ApiError } from '@/lib/api/errors'
import {
  AUTH_SESSION_STORAGE_KEY,
  AUTH_SESSION_VERSION_STORAGE_KEY,
} from '@/lib/auth/credential-storage'
import { AUTH_SHARED_STATE_KEY } from '@/lib/auth/cross-tab-session'
import { sessionSafetyStorageKeys } from '@/lib/auth/session-safety-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const commissionSafetyKey =
  sessionSafetyStorageKeys.commissionTransferUncertainty
const withdrawalSafetyKey =
  sessionSafetyStorageKeys.withdrawalRequestUncertainty

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const loginResponse: LoginResponse = {
  accessToken: 'opaque-session-token',
  tokenType: 'Bearer',
}

function createAuthApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    login: vi.fn().mockResolvedValue(loginResponse),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
    ...overrides,
  }
}

function renderRoute(
  path: string,
  api: AuthApi = createAuthApi(),
  queryClient: QueryClient = createQueryClient(),
) {
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders router={router} authApi={api} queryClient={queryClient} />,
  )
  return { queryClient, router }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function writeSharedState(
  version: string,
  status: 'active' | 'changing' | 'logged-out',
) {
  window.localStorage.setItem(
    AUTH_SHARED_STATE_KEY,
    JSON.stringify({ version, status }),
  )
}

function readSharedState() {
  return JSON.parse(window.localStorage.getItem(AUTH_SHARED_STATE_KEY)!) as {
    version: string
    status: 'active' | 'changing' | 'logged-out'
  }
}

function AuthTransitionHarness() {
  const {
    currentUser: user,
    logout,
    retryBootstrap,
    signIn,
    status,
  } = useAuth()

  return (
    <div>
      <output data-testid="auth-status">{status}</output>
      <output data-testid="current-user">{user?.email ?? 'none'}</output>
      <button type="button" onClick={logout}>
        logout
      </button>
      <button
        type="button"
        onClick={() => {
          void signIn({
            email: 'session-b@example.com',
            password: 'password123',
          }).catch(() => undefined)
        }}
      >
        login session B
      </button>
      <button type="button" onClick={retryBootstrap}>
        retry auth
      </button>
    </div>
  )
}

function renderAuthTransition(api: AuthApi) {
  const queryClient = createQueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider api={api}>
        <AuthTransitionHarness />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return queryClient
}

describe('Auth session lifecycle', () => {
  it('redirects an unauthenticated protected route to login', async () => {
    const { router } = renderRoute('/dashboard')

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('stores a successful login, bootstraps /me, and enters the app', async () => {
    window.sessionStorage.setItem(commissionSafetyKey, 'active')
    window.sessionStorage.setItem(withdrawalSafetyKey, 'acknowledged')
    const login = vi.fn().mockResolvedValue(loginResponse)
    const getCurrentUser = vi.fn().mockResolvedValue(currentUser)
    const api = createAuthApi({ login, getCurrentUser })
    const { router } = renderRoute('/login', api)
    const user = userEvent.setup()

    await user.type(
      await screen.findByLabelText('邮箱'),
      ' member@example.com ',
    )
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    expect(login).toHaveBeenCalledOnce()
    expect(login).toHaveBeenCalledWith({
      email: 'member@example.com',
      password: 'password123',
    })
    expect(getCurrentUser).toHaveBeenCalledWith('opaque-session-token')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'opaque-session-token',
    )
    expect(useAuthSessionStore.getState().accessToken).toBe(
      'opaque-session-token',
    )
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(useAuthSessionStore.getState().generation).toBe(1)
    expect(screen.getAllByText('member@example.com').length).toBeGreaterThan(0)
  })

  it('completes login and /me bootstrap with a memory-only credential', async () => {
    const originalSetItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (this === window.sessionStorage && key === AUTH_SESSION_STORAGE_KEY) {
        throw new DOMException('Storage disabled', 'SecurityError')
      }
      return originalSetItem.call(this, key, value)
    })
    const getCurrentUser = vi.fn().mockResolvedValue(currentUser)
    const { router } = renderRoute('/login', createAuthApi({ getCurrentUser }))
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    expect(useAuthSessionStore.getState().accessToken).toBe(
      'opaque-session-token',
    )
    expect(getCurrentUser).toHaveBeenCalledWith('opaque-session-token')
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('disables duplicate login submission while the request is pending', async () => {
    let resolveLogin!: (value: LoginResponse) => void
    const login = vi.fn(
      () =>
        new Promise<LoginResponse>((resolve) => {
          resolveLogin = resolve
        }),
    )
    const api = createAuthApi({ login })
    renderRoute('/login', api)
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    const pendingButton = screen.getByRole('button', { name: '正在登录…' })
    expect(pendingButton).toBeDisabled()
    await user.click(pendingButton)
    expect(login).toHaveBeenCalledOnce()

    resolveLogin(loginResponse)
    await screen.findAllByRole('heading', { name: 'Overview' })
  })

  it('does not persist or retry a failed login', async () => {
    const login = vi.fn().mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_FAILED',
        message: 'Authentication failed',
        requestId: 'req-login',
      }),
    )
    renderRoute('/login', createAuthApi({ login }))
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'member@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(
      await screen.findByText('邮箱或密码错误，或账户当前无法登录。'),
    ).toBeInTheDocument()
    expect(screen.getByText('请求编号：req-login')).toBeInTheDocument()
    expect(login).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('validates login fields on keyboard submit without calling the API', async () => {
    const login = vi.fn().mockResolvedValue(loginResponse)
    renderRoute('/login', createAuthApi({ login }))
    const user = userEvent.setup()

    await user.type(await screen.findByLabelText('邮箱'), 'invalid-email')
    await user.type(screen.getByLabelText('密码'), 'short')
    await user.keyboard('{Enter}')

    expect(await screen.findByText('请输入有效的邮箱地址')).toBeInTheDocument()
    expect(screen.getByText('密码至少需要 8 个字符')).toBeInTheDocument()
    expect(login).not.toHaveBeenCalled()
  })

  it('restores a valid session and allows the protected app', async () => {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      'stored-session-token',
    )
    window.sessionStorage.setItem(commissionSafetyKey, 'active')
    window.sessionStorage.setItem(withdrawalSafetyKey, 'acknowledged')
    const getCurrentUser = vi.fn().mockResolvedValue(currentUser)
    const { router } = renderRoute(
      '/dashboard',
      createAuthApi({ getCurrentUser }),
    )

    await screen.findAllByRole('heading', { name: 'Overview' })
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(getCurrentUser).toHaveBeenCalledWith('stored-session-token')
    expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe(
      'acknowledged',
    )
    expect(useAuthSessionStore.getState().generation).toBe(0)
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'clears a stored credential after %s proves it invalid',
    async (code) => {
      window.sessionStorage.setItem(
        AUTH_SESSION_STORAGE_KEY,
        'invalid-session-token',
      )
      window.sessionStorage.setItem(commissionSafetyKey, 'active')
      window.sessionStorage.setItem(withdrawalSafetyKey, 'acknowledged')
      const api = createAuthApi({
        getCurrentUser: vi.fn().mockRejectedValue(
          new ApiError({
            status: 401,
            code,
            message: 'Authentication failed',
          }),
        ),
      })
      const queryClient = createQueryClient()
      queryClient.setQueryData(['private-account-data'], { secret: 'cached' })
      const { router } = renderRoute('/dashboard', api, queryClient)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
      expect(useAuthSessionStore.getState().generation).toBe(1)
      expect(queryClient.getQueryData(['private-account-data'])).toBeUndefined()
    },
  )

  it.each([
    [0, 'NETWORK_ERROR'],
    [502, 'UPSTREAM_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
  ])(
    'retains the credential for recoverable %s/%s bootstrap failure',
    async (status, code) => {
      window.sessionStorage.setItem(
        AUTH_SESSION_STORAGE_KEY,
        'recoverable-session-token',
      )
      const api = createAuthApi({
        getCurrentUser: vi
          .fn()
          .mockRejectedValue(
            new ApiError({ status, code, message: 'Service unavailable' }),
          ),
      })
      renderRoute('/dashboard', api)

      expect(
        await screen.findByRole(
          'heading',
          { name: '暂时无法连接服务' },
          { timeout: 3_000 },
        ),
      ).toBeInTheDocument()
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
        'recoverable-session-token',
      )
    },
  )

  it('does not render protected content while bootstrap is unresolved', async () => {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      'pending-session-token',
    )
    const api = createAuthApi({
      getCurrentUser: vi.fn(() => new Promise<CurrentUser>(() => undefined)),
    })
    renderRoute('/dashboard', api)

    expect(
      await screen.findByRole('heading', { name: '正在验证登录状态' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull()
  })

  it('recovers a retained session when bootstrap retry succeeds', async () => {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      'recoverable-session-token',
    )
    const serviceError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'Service unavailable',
    })
    const getCurrentUser = vi
      .fn()
      .mockRejectedValueOnce(serviceError)
      .mockRejectedValueOnce(serviceError)
      .mockResolvedValue(currentUser)
    const { router } = renderRoute(
      '/dashboard',
      createAuthApi({ getCurrentUser }),
    )
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: '重试' }, { timeout: 3_000 }),
    )

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    expect(getCurrentUser).toHaveBeenCalledTimes(3)
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'recoverable-session-token',
    )
  })

  it('resolves the root route to login without a credential', async () => {
    const { router } = renderRoute('/')
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })

  it('resolves the root route to dashboard with a valid credential', async () => {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      'stored-session-token',
    )
    const { router } = renderRoute('/')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
  })

  it('redirects an authenticated user away from login', async () => {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      'stored-session-token',
    )
    const { router } = renderRoute('/login')

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
  })

  it('clears the credential and all query cache data on local logout', async () => {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      'stored-session-token',
    )
    window.sessionStorage.setItem(commissionSafetyKey, 'active')
    window.sessionStorage.setItem(withdrawalSafetyKey, 'acknowledged')
    const queryClient = createQueryClient()
    queryClient.setQueryData(['private-account-data'], { secret: 'cached' })
    const { router } = renderRoute('/dashboard', createAuthApi(), queryClient)
    const user = userEvent.setup()

    await screen.findAllByText('member@example.com')
    await user.click(screen.getAllByRole('button', { name: '退出登录' })[0]!)

    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(useAuthSessionStore.getState().generation).toBe(1)
    expect(queryClient.getQueryData(['private-account-data'])).toBeUndefined()
  })

  it('does not resurrect session A when its in-flight /me resolves after logout', async () => {
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'session-a-token')
    const sessionA = createDeferred<CurrentUser>()
    const getCurrentUser = vi.fn(() => sessionA.promise)
    const queryClient = renderAuthTransition(createAuthApi({ getCurrentUser }))
    const user = userEvent.setup()

    await waitFor(() =>
      expect(getCurrentUser).toHaveBeenCalledWith('session-a-token'),
    )
    await user.click(screen.getByRole('button', { name: 'logout' }))
    expect(screen.getByTestId('auth-status')).toHaveTextContent(
      'unauthenticated',
    )

    await act(async () => {
      sessionA.resolve({ ...currentUser, email: 'session-a@example.com' })
      await sessionA.promise
    })
    expect(screen.getByTestId('current-user')).toHaveTextContent('none')
    expect(queryClient.getQueryData(authQueryKeys.me)).toBeUndefined()
    expect(useAuthSessionStore.getState().accessToken).toBeNull()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(useAuthSessionStore.getState().generation).toBe(1)
  })

  it.each(['resolve', 'reject'] as const)(
    'keeps session B when stale session A later %ss',
    async (settlement) => {
      window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'session-a-token')
      window.sessionStorage.setItem(commissionSafetyKey, 'active')
      window.sessionStorage.setItem(withdrawalSafetyKey, 'acknowledged')
      const sessionA = createDeferred<CurrentUser>()
      const sessionBUser: CurrentUser = {
        ...currentUser,
        email: 'session-b@example.com',
      }
      const login = vi.fn().mockResolvedValue({
        accessToken: 'session-b-token',
        tokenType: 'Bearer' as const,
      })
      const getCurrentUser = vi.fn((accessToken: string) =>
        accessToken === 'session-a-token'
          ? sessionA.promise
          : Promise.resolve(sessionBUser),
      )
      const queryClient = renderAuthTransition(
        createAuthApi({ getCurrentUser, login }),
      )
      const user = userEvent.setup()

      await waitFor(() =>
        expect(getCurrentUser).toHaveBeenCalledWith('session-a-token'),
      )
      await user.click(screen.getByRole('button', { name: 'login session B' }))
      await waitFor(() => {
        expect(screen.getByTestId('auth-status')).toHaveTextContent(
          'authenticated',
        )
        expect(screen.getByTestId('current-user')).toHaveTextContent(
          'session-b@example.com',
        )
      })

      if (settlement === 'resolve') {
        await act(async () => {
          sessionA.resolve({ ...currentUser, email: 'session-a@example.com' })
          await sessionA.promise
        })
      } else {
        await act(async () => {
          sessionA.reject(
            new ApiError({
              status: 401,
              code: 'AUTH_FAILED',
              message: 'Authentication failed',
            }),
          )
          await sessionA.promise.catch(() => undefined)
        })
      }

      expect(screen.getByTestId('current-user')).toHaveTextContent(
        'session-b@example.com',
      )
      expect(queryClient.getQueryData(authQueryKeys.me)).toEqual(sessionBUser)
      expect(useAuthSessionStore.getState().accessToken).toBe('session-b-token')
      expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
        'session-b-token',
      )
      expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
      expect(useAuthSessionStore.getState().generation).toBe(1)
      expect(readSharedState()).toEqual({
        version: useAuthSessionStore.getState().sessionVersion,
        status: 'active',
      })
    },
  )

  it.each(['changing', 'active', 'logged-out'] as const)(
    'does not let late session A success overwrite remote %s state',
    async (remoteStatus) => {
      window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'session-a-token')
      window.sessionStorage.setItem(
        AUTH_SESSION_VERSION_STORAGE_KEY,
        'session-a',
      )
      writeSharedState('session-a', 'active')
      const sessionA = createDeferred<CurrentUser>()
      const getCurrentUser = vi.fn(() => sessionA.promise)
      renderAuthTransition(createAuthApi({ getCurrentUser }))

      await waitFor(() =>
        expect(getCurrentUser).toHaveBeenCalledWith('session-a-token'),
      )
      writeSharedState('remote-new', remoteStatus)
      await act(async () => {
        sessionA.resolve({ ...currentUser, email: 'session-a@example.com' })
        await sessionA.promise
      })

      await waitFor(() =>
        expect(useAuthSessionStore.getState().accessToken).toBeNull(),
      )
      expect(readSharedState()).toEqual({
        version: 'remote-new',
        status: remoteStatus,
      })
      expect(screen.getByTestId('current-user')).toHaveTextContent('none')
    },
  )

  it('does not publish logout when a stale session A /me returns 401', async () => {
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'session-a-token')
    window.sessionStorage.setItem(AUTH_SESSION_VERSION_STORAGE_KEY, 'session-a')
    writeSharedState('session-a', 'active')
    const sessionA = createDeferred<CurrentUser>()
    const getCurrentUser = vi.fn(() => sessionA.promise)
    renderAuthTransition(createAuthApi({ getCurrentUser }))
    await waitFor(() =>
      expect(getCurrentUser).toHaveBeenCalledWith('session-a-token'),
    )

    writeSharedState('session-b', 'active')
    await act(async () => {
      sessionA.reject(
        new ApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        }),
      )
      await sessionA.promise.catch(() => undefined)
    })

    await waitFor(() =>
      expect(useAuthSessionStore.getState().accessToken).toBeNull(),
    )
    expect(readSharedState()).toEqual({
      version: 'session-b',
      status: 'active',
    })
  })

  it.each([
    [0, 'NETWORK_ERROR'],
    [502, 'UPSTREAM_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
  ])(
    'keeps a new session recoverable after %s/%s establishment failure',
    async (status, code) => {
      const error = new ApiError({
        status,
        code,
        message: 'Temporary failure',
      })
      const getCurrentUser = vi.fn().mockRejectedValue(error)
      renderAuthTransition(createAuthApi({ getCurrentUser }))
      const user = userEvent.setup()

      await user.click(screen.getByRole('button', { name: 'login session B' }))
      await waitFor(
        () =>
          expect(screen.getByTestId('auth-status')).toHaveTextContent('error'),
        { timeout: 3_000 },
      )
      expect(useAuthSessionStore.getState().accessToken).toBe(
        'opaque-session-token',
      )
      expect(readSharedState()).toEqual({
        version: useAuthSessionStore.getState().sessionVersion,
        status: 'changing',
      })

      getCurrentUser.mockResolvedValue(currentUser)
      await user.click(screen.getByRole('button', { name: 'retry auth' }))
      await waitFor(() =>
        expect(screen.getByTestId('auth-status')).toHaveTextContent(
          'authenticated',
        ),
      )
      expect(readSharedState()).toEqual({
        version: useAuthSessionStore.getState().sessionVersion,
        status: 'active',
      })
    },
  )

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'logs out a newly established session after current %s',
    async (code) => {
      const getCurrentUser = vi.fn().mockRejectedValue(
        new ApiError({
          status: 401,
          code,
          message: 'Authentication failed',
        }),
      )
      renderAuthTransition(createAuthApi({ getCurrentUser }))
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'login session B' }))

      await waitFor(() =>
        expect(screen.getByTestId('auth-status')).toHaveTextContent(
          'unauthenticated',
        ),
      )
      expect(useAuthSessionStore.getState().accessToken).toBeNull()
      expect(readSharedState().status).toBe('logged-out')
    },
  )

  it.each(['initial bootstrap', 'remote active notification'] as const)(
    'drops a provided candidate when shared state changes before %s installs it',
    async (path) => {
      class RaceBroadcastChannel {
        static instance: RaceBroadcastChannel | null = null
        onmessage: ((event: MessageEvent) => void) | null = null
        constructor() {
          RaceBroadcastChannel.instance = this
        }
        postMessage(message: unknown) {
          const request = message as {
            type?: string
            requestId?: string
            version?: string
          }
          if (request.type !== 'REQUEST_SESSION') return
          this.onmessage?.({
            data: {
              type: 'PROVIDE_SESSION',
              requestId: request.requestId,
              version: request.version,
              accessToken: 'stale-provided-token',
            },
          } as MessageEvent)
          writeSharedState('newer-logout', 'logged-out')
        }
        close() {}
      }
      vi.stubGlobal('BroadcastChannel', RaceBroadcastChannel)
      const getCurrentUser = vi.fn().mockResolvedValue(currentUser)
      if (path === 'initial bootstrap') {
        writeSharedState('provided-version', 'active')
      }
      renderAuthTransition(createAuthApi({ getCurrentUser }))

      if (path === 'remote active notification') {
        await waitFor(() =>
          expect(screen.getByTestId('auth-status')).toHaveTextContent(
            'unauthenticated',
          ),
        )
        writeSharedState('provided-version', 'active')
        RaceBroadcastChannel.instance?.onmessage?.({
          data: {
            type: 'SESSION_CHANGED',
            version: 'provided-version',
            status: 'active',
          },
        } as MessageEvent)
      }

      await waitFor(() =>
        expect(readSharedState()).toEqual({
          version: 'newer-logout',
          status: 'logged-out',
        }),
      )
      expect(screen.getByTestId('auth-status')).toHaveTextContent(
        'unauthenticated',
      )
      expect(getCurrentUser).not.toHaveBeenCalledWith('stale-provided-token')
      expect(useAuthSessionStore.getState().accessToken).toBeNull()
      expect(readSharedState()).toEqual({
        version: 'newer-logout',
        status: 'logged-out',
      })
      vi.unstubAllGlobals()
    },
  )

  it.each(['resolve', 'reject'] as const)(
    'does not let a local login %s overwrite a remotely advanced version',
    async (settlement) => {
      const sessionB = createDeferred<CurrentUser>()
      const getCurrentUser = vi.fn(() => sessionB.promise)
      renderAuthTransition(createAuthApi({ getCurrentUser }))
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'login session B' }))
      await waitFor(() =>
        expect(getCurrentUser).toHaveBeenCalledWith('opaque-session-token'),
      )

      writeSharedState('remote-session-c', 'active')
      await act(async () => {
        if (settlement === 'resolve') {
          sessionB.resolve({ ...currentUser, email: 'session-b@example.com' })
          await sessionB.promise
        } else {
          sessionB.reject(
            new ApiError({
              status: 401,
              code: 'AUTH_FAILED',
              message: 'Authentication failed',
            }),
          )
          await sessionB.promise.catch(() => undefined)
        }
      })

      await waitFor(() =>
        expect(useAuthSessionStore.getState().accessToken).toBeNull(),
      )
      expect(readSharedState()).toEqual({
        version: 'remote-session-c',
        status: 'active',
      })
    },
  )
})
