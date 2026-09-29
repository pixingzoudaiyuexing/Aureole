import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'
import { accountApi } from '@/features/account/account-api'
import type { CurrentUser } from '@/features/auth/auth-api'
import { AuthContext, type AuthStatus } from '@/features/auth/auth-context'
import { AuthProvider } from '@/features/auth/auth-provider'
import { useAuth } from '@/features/auth/auth-context'
import { CrispIntegration } from '@/features/crisp/crisp-integration'
import {
  CRISP_SCRIPT_ID,
  CRISP_SCRIPT_URL,
  describeClient,
  type CrispCommand,
} from '@/features/crisp/crisp-runtime'
import { runtimeSettingsApi } from '@/features/runtime-settings/runtime-settings-api'
import {
  subscriptionApi,
  type SubscriptionOverview,
} from '@/features/subscription/subscription-api'
import { walletApi } from '@/features/wallet/wallet-api'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { ApiError } from '@/lib/api/errors'

const websiteId = '11111111-1111-4111-8111-111111111111'
const settings = {
  siteName: null,
  brandName: null,
  title: null,
  description: null,
  logoUrl: null,
  faviconUrl: null,
  footerText: null,
  crispWebsiteId: websiteId,
}
const user: CurrentUser = {
  email: 'a@example.com',
  expiresAt: null,
  status: 'active',
  sessionVersion: '22222222-2222-4222-8222-222222222222',
}
const overview: SubscriptionOverview = {
  product: { id: '7', name: 'Plus' },
  expiresAt: '2030-04-05T10:00:00.000Z',
  traffic: {
    uploadedBytes: 1024,
    downloadedBytes: 2048,
    allowanceBytes: 10240,
  },
  deviceLimit: null,
  activeDevices: 0,
  resetDay: null,
  renewalAllowed: false,
}

function commands() {
  return (window.$crisp ?? []) as CrispCommand[]
}

function sessionData() {
  return Object.fromEntries(
    commands()
      .filter(
        (
          command,
        ): command is Extract<CrispCommand, ['set', 'session:data', unknown]> =>
          command[0] === 'set' && command[1] === 'session:data',
      )
      .flatMap((command) => command[2][0]),
  )
}

function setup({
  configured = true,
  authenticated = false,
  strict = false,
  subscriptionData = overview,
} = {}) {
  const queryClient = createQueryClient()
  vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue({
    ...settings,
    crispWebsiteId: configured ? websiteId : null,
  })
  const subscription = vi
    .spyOn(subscriptionApi, 'getOverview')
    .mockResolvedValue(subscriptionData)
  const wallet = vi
    .spyOn(walletApi, 'getWallet')
    .mockResolvedValue({ balanceMinor: 12345 })
  const config = vi
    .spyOn(accountApi, 'getConfig')
    .mockResolvedValue({ currency: 'CNY', currencySymbol: '¥' })
  if (authenticated) {
    useAuthSessionStore.setState({
      accessToken: 'opaque-a',
      generation: 1,
      validated: true,
    })
  }
  const tree = (status: AuthStatus, currentUser: CurrentUser | null) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider
        value={{
          status,
          currentUser,
          bootstrapError: null,
          establishSession: vi.fn(),
          signIn: vi.fn(),
          retryBootstrap: vi.fn(),
          logout: vi.fn(),
          sessionInvalidated: vi.fn(),
        }}
      >
        <CrispIntegration />
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  const wrap = (status: AuthStatus, currentUser: CurrentUser | null) =>
    strict ? (
      <StrictMode>{tree(status, currentUser)}</StrictMode>
    ) : (
      tree(status, currentUser)
    )
  const result = render(
    wrap(
      authenticated ? 'authenticated' : 'unauthenticated',
      authenticated ? user : null,
    ),
  )
  return {
    ...result,
    queryClient,
    subscription,
    wallet,
    config,
    update: (status: AuthStatus, currentUser: CurrentUser | null) =>
      result.rerender(wrap(status, currentUser)),
  }
}

afterEach(() => {
  document.getElementById(CRISP_SCRIPT_ID)?.remove()
  delete window.$crisp
  delete window.CRISP_WEBSITE_ID
})

describe('Crisp integration', () => {
  it('does not bootstrap or query private data when runtime ID is null', async () => {
    const { subscription, wallet, config } = setup({ configured: false })
    await waitFor(() =>
      expect(runtimeSettingsApi.getRuntimeSettings).toHaveBeenCalled(),
    )
    expect(document.getElementById(CRISP_SCRIPT_ID)).toBeNull()
    expect(window.$crisp).toBeUndefined()
    expect(subscription).not.toHaveBeenCalled()
    expect(wallet).not.toHaveBeenCalled()
    expect(config).not.toHaveBeenCalled()
  })

  it('loads one fixed async script and only anonymous Client data', async () => {
    const { subscription, wallet, config, update } = setup({ strict: true })
    await waitFor(() =>
      expect(document.getElementById(CRISP_SCRIPT_ID)).not.toBeNull(),
    )
    const script = document.getElementById(CRISP_SCRIPT_ID) as HTMLScriptElement
    expect(script.src).toBe(CRISP_SCRIPT_URL)
    expect(script.async).toBe(true)
    expect(window.CRISP_WEBSITE_ID).toBe(websiteId)
    expect(sessionData()).toEqual({
      Client: describeClient(navigator.userAgent),
    })
    expect(commands().some((command) => command[1] === 'user:email')).toBe(
      false,
    )
    expect(subscription).not.toHaveBeenCalled()
    expect(wallet).not.toHaveBeenCalled()
    expect(config).not.toHaveBeenCalled()

    act(() => script.dispatchEvent(new Event('error')))
    update('unauthenticated', null)
    expect(document.querySelectorAll(`#${CRISP_SCRIPT_ID}`)).toHaveLength(1)
  })

  it('uses official email/session-data queues with only approved metadata', async () => {
    setup({ authenticated: true })
    await waitFor(() =>
      expect(sessionData()).toMatchObject({
        Plan: 'Plus',
        ExpireTime: '2030-04-05',
        UsedTraffic: '3 KB',
        AllTraffic: '10 KB',
        Balance: '¥123.45 CNY',
      }),
    )
    expect(commands()).toContainEqual(['set', 'user:email', ['a@example.com']])
    expect(Object.keys(sessionData()).sort()).toEqual([
      'AllTraffic',
      'Balance',
      'Client',
      'ExpireTime',
      'Plan',
      'UsedTraffic',
    ])
    expect(JSON.stringify(commands())).not.toMatch(
      /opaque-a|sessionVersion|accessUrl|Authorization|subscribeToken/,
    )
    expect(
      JSON.stringify({ ...window.localStorage, ...window.sessionStorage }),
    ).not.toContain('Plus')
  })

  it('keeps available metadata when subscription or wallet/config reads fail', async () => {
    const { subscription, wallet, config, queryClient } = setup({
      authenticated: true,
    })
    subscription.mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'BAD_REQUEST',
        message: 'no subscription',
      }),
    )
    wallet.mockRejectedValue(
      new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'no wallet' }),
    )
    queryClient.removeQueries({ queryKey: ['subscription', 'overview'] })
    queryClient.removeQueries({ queryKey: ['wallet'] })
    await waitFor(() => expect(sessionData().Client).toBeDefined())
    expect(sessionData().Plan).toBeUndefined()
    expect(sessionData().Balance).toBeUndefined()
    expect(commands()).toContainEqual(['set', 'user:email', ['a@example.com']])
    expect(config).toHaveBeenCalled()
  })

  it('uses placeholders for missing product and expiry and skips Balance without currency', async () => {
    const { subscription, config, queryClient } = setup({ authenticated: true })
    subscription.mockResolvedValue({
      ...overview,
      product: null,
      expiresAt: null,
    })
    config.mockRejectedValue(
      new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'no config' }),
    )
    queryClient.removeQueries({ queryKey: ['subscription', 'overview'] })
    queryClient.removeQueries({ queryKey: ['config', 'account'] })
    await waitFor(() =>
      expect(sessionData()).toMatchObject({ Plan: '-', ExpireTime: '-' }),
    )
    expect(sessionData().Balance).toBeUndefined()
  })

  it('resets once at logout and prevents A data from reappearing for B', async () => {
    const { update, subscription, wallet, config, queryClient } = setup({
      authenticated: true,
    })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    act(() => {
      queryClient.clear()
      useAuthSessionStore.setState({
        accessToken: null,
        generation: 2,
        validated: false,
      })
      update('unauthenticated', null)
    })
    expect(
      commands().filter((command) => command[1] === 'session:reset'),
    ).toHaveLength(1)
    expect(JSON.stringify(commands())).not.toContain('a@example.com')
    expect(subscription).toHaveBeenCalledTimes(1)

    subscription.mockResolvedValue({
      ...overview,
      product: { id: '8', name: 'Starter' },
    })
    wallet.mockResolvedValue({ balanceMinor: 500 })
    config.mockResolvedValue({ currency: 'JPY', currencySymbol: '¥' })
    act(() => {
      useAuthSessionStore.setState({
        accessToken: 'opaque-b',
        generation: 3,
        validated: true,
      })
      update('authenticated', { ...user, email: 'b@example.com' })
    })
    await waitFor(() =>
      expect(sessionData()).toMatchObject({
        Plan: 'Starter',
        Balance: '¥500 JPY',
      }),
    )
    expect(commands()).toContainEqual(['set', 'user:email', ['b@example.com']])
    expect(JSON.stringify(commands())).not.toContain('a@example.com')
    update('authenticated', { ...user, email: 'b@example.com' })
    expect(
      commands().filter((command) => command[1] === 'session:reset'),
    ).toHaveLength(1)
    expect(document.querySelectorAll(`#${CRISP_SCRIPT_ID}`)).toHaveLength(1)
  })

  it('resets before applying B metadata on a direct authenticated account switch', async () => {
    const { update, queryClient, subscription } = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Plan).toBe('Plus'))
    subscription.mockResolvedValue({
      ...overview,
      product: { id: '8', name: 'Starter' },
    })
    act(() => {
      queryClient.clear()
      useAuthSessionStore.setState({
        accessToken: 'opaque-b',
        generation: 2,
        validated: true,
      })
      update('authenticated', { ...user, email: 'b@example.com' })
    })
    await waitFor(() => expect(sessionData().Plan).toBe('Starter'))
    const queue = commands()
    const resetIndex = queue.findIndex(
      (command) => command[1] === 'session:reset',
    )
    const emailIndex = queue.findIndex((command) => command[1] === 'user:email')
    expect(resetIndex).toBeGreaterThanOrEqual(0)
    expect(emailIndex).toBeGreaterThan(resetIndex)
    expect(queue[emailIndex]).toEqual(['set', 'user:email', ['b@example.com']])
    expect(JSON.stringify(queue)).not.toContain('a@example.com')
  })

  it('does not send B context if the existing Crisp session cannot reset', async () => {
    const { update, queryClient } = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Plan).toBe('Plus'))
    const sent: CrispCommand[] = []
    window.$crisp = {
      push: (command) => {
        if (command[1] === 'session:reset') throw new Error('Crisp unavailable')
        sent.push(command)
      },
    }
    act(() => {
      queryClient.clear()
      useAuthSessionStore.setState({
        accessToken: 'opaque-b',
        generation: 2,
        validated: true,
      })
      update('authenticated', { ...user, email: 'b@example.com' })
    })
    await waitFor(() => expect(sent).toContainEqual(['do', 'chat:hide']))
    expect(JSON.stringify(sent)).not.toContain('b@example.com')
    expect(sent.some((command) => command[1] === 'session:data')).toBe(false)
  })

  it('skips UsedTraffic when the sum exceeds a safe integer', async () => {
    setup({
      authenticated: true,
      subscriptionData: {
        ...overview,
        traffic: {
          uploadedBytes: Number.MAX_SAFE_INTEGER,
          downloadedBytes: 1,
          allowanceBytes: 10240,
        },
      },
    })
    await waitFor(() => expect(sessionData().AllTraffic).toBe('10 KB'))
    expect(sessionData().UsedTraffic).toBeUndefined()
  })

  it('suspends a changed Website ID without loading a second script', async () => {
    const { queryClient } = setup()
    await waitFor(() =>
      expect(document.getElementById(CRISP_SCRIPT_ID)).not.toBeNull(),
    )
    act(() =>
      queryClient.setQueryData(['runtime-settings'], {
        ...settings,
        crispWebsiteId: '33333333-3333-4333-8333-333333333333',
      }),
    )
    expect(document.querySelectorAll(`#${CRISP_SCRIPT_ID}`)).toHaveLength(1)
    await waitFor(() =>
      expect(commands()).toContainEqual(['do', 'session:reset']),
    )
    expect(commands()).toContainEqual(['do', 'chat:hide'])
  })

  it('uses the real AuthProvider boundary to reset before a second login', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(settings)
    vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue(overview)
    vi.spyOn(walletApi, 'getWallet').mockResolvedValue({ balanceMinor: 12345 })
    vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
      currency: 'CNY',
      currencySymbol: '¥',
    })
    let current: CurrentUser | null = user
    const authApi = {
      getCurrentUser: vi.fn(async () => {
        if (!current)
          throw new ApiError({
            status: 401,
            code: 'AUTH_REQUIRED',
            message: 'No session',
          })
        return current
      }),
      login: vi.fn(async () => {
        current = {
          ...user,
          email: 'b@example.com',
          sessionVersion: '33333333-3333-4333-8333-333333333333',
        }
        return current
      }),
      logout: vi.fn(async () => {
        current = null
      }),
    }
    function AuthHarness() {
      const { status, logout, signIn } = useAuth()
      return (
        <div>
          <output data-testid="auth-status">{status}</output>
          <button onClick={logout}>logout</button>
          <button
            onClick={() =>
              void signIn({
                email: 'b@example.com',
                password: 'example-password',
              })
            }
          >
            login B
          </button>
        </div>
      )
    }
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider api={authApi}>
          <CrispIntegration />
          <AuthHarness />
        </AuthProvider>
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(commands()).toContainEqual([
        'set',
        'user:email',
        ['a@example.com'],
      ]),
    )
    const browserUser = userEvent.setup()
    await browserUser.click(screen.getByRole('button', { name: 'logout' }))
    await waitFor(() =>
      expect(screen.getByTestId('auth-status')).toHaveTextContent(
        'unauthenticated',
      ),
    )
    expect(commands()).toContainEqual(['do', 'session:reset'])
    expect(JSON.stringify(commands())).not.toContain('a@example.com')
    await browserUser.click(screen.getByRole('button', { name: 'login B' }))
    await waitFor(() =>
      expect(commands()).toContainEqual([
        'set',
        'user:email',
        ['b@example.com'],
      ]),
    )
    expect(JSON.stringify(commands())).not.toContain('a@example.com')
    expect(document.querySelectorAll(`#${CRISP_SCRIPT_ID}`)).toHaveLength(1)
  })

  it('hides and resets when a configured Website ID becomes null', async () => {
    const { queryClient } = setup()
    await waitFor(() =>
      expect(document.getElementById(CRISP_SCRIPT_ID)).not.toBeNull(),
    )
    act(() =>
      queryClient.setQueryData(['runtime-settings'], {
        ...settings,
        crispWebsiteId: null,
      }),
    )
    await waitFor(() =>
      expect(commands()).toContainEqual(['do', 'session:reset']),
    )
    expect(commands()).toContainEqual(['do', 'chat:hide'])
    expect(document.querySelectorAll(`#${CRISP_SCRIPT_ID}`)).toHaveLength(1)
    act(() => queryClient.setQueryData(['runtime-settings'], settings))
    await waitFor(() => expect(commands()).toContainEqual(['do', 'chat:show']))
    expect(document.querySelectorAll(`#${CRISP_SCRIPT_ID}`)).toHaveLength(1)
  })
})
