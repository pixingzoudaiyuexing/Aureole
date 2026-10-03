import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/app/providers/query-client'
import { AppProviders } from '@/app/providers/app-providers'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import type { CurrentUser } from '@/features/auth/auth-api'
import { AuthContext, useAuth } from '@/features/auth/auth-context'
import { AuthProvider } from '@/features/auth/auth-provider'
import { CrispLoader, type CrispCommand } from '@/features/crisp/crisp-loader'
import { CrispMetadata } from '@/features/crisp/crisp-metadata'
import loaderSource from '@/features/crisp/crisp-loader.tsx?raw'
import metadataSource from '@/features/crisp/crisp-metadata.tsx?raw'
import scriptSource from '@/features/crisp/crisp-script.ts?raw'
import { RuntimeSettingsProvider } from '@/features/runtime-settings/runtime-settings-provider'
import { runtimeSettingsApi } from '@/features/runtime-settings/runtime-settings-api'
import { runtimeSettingsQueryKey } from '@/features/runtime-settings/runtime-settings-queries'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { walletApi } from '@/features/wallet/wallet-api'
import { useAuthSessionStore } from '@/lib/auth/session-store'
import { ApiError } from '@/lib/api/errors'

const websiteId = 'f2f29d4a-625e-4613-bd18-6ae788aac471'
const scriptId = 'aureole-crisp-loader'
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
  email: 'member@example.com',
  status: 'active',
  expiresAt: null,
  sessionVersion: '22222222-2222-4222-8222-222222222222',
}

function commands() {
  return (window.$crisp ?? []) as CrispCommand[]
}

function sessionData() {
  return Object.fromEntries(
    commands()
      .filter(
        (command) => command[0] === 'set' && command[1] === 'session:data',
      )
      .flatMap((command) => command[2][0]),
  )
}

function setup({
  configured = true,
  authenticated = false,
  walletUnavailable = false,
} = {}) {
  const queryClient = createQueryClient()
  const publicQueryClient = createQueryClient()
  vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue({
    ...settings,
    crispWebsiteId: configured ? websiteId : null,
  })
  vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue({
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
  })
  const wallet = vi.spyOn(walletApi, 'getWallet')
  if (walletUnavailable)
    wallet.mockRejectedValue(new Error('Wallet unavailable'))
  else wallet.mockResolvedValue({ balanceMinor: 12345 })
  vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  if (authenticated) {
    useAuthSessionStore.setState({
      accessToken: 'opaque-a',
      validated: true,
    })
  }
  let activeUser = authenticated ? user : null
  const children = () => (
    <QueryClientProvider client={queryClient}>
      <RuntimeSettingsProvider queryClient={publicQueryClient}>
        <CrispLoader />
        <AuthContext.Provider
          value={{
            status: activeUser ? 'authenticated' : 'unauthenticated',
            currentUser: activeUser,
            bootstrapError: null,
            establishSession: vi.fn(),
            signIn: vi.fn(),
            retryBootstrap: vi.fn(),
            logout: vi.fn(),
            sessionInvalidated: vi.fn(),
          }}
        >
          <CrispMetadata />
        </AuthContext.Provider>
      </RuntimeSettingsProvider>
    </QueryClientProvider>
  )
  const view = render(children())
  return {
    ...view,
    queryClient,
    setUser(next: CurrentUser | null) {
      act(() => {
        // Mirror the existing AuthProvider private-cache boundary.
        if (activeUser?.email !== next?.email) queryClient.clear()
        activeUser = next
        useAuthSessionStore.setState({
          accessToken: next ? 'opaque-session' : null,
          validated: Boolean(next),
        })
        view.rerender(children())
      })
    },
    setWebsiteId(id: string | null) {
      act(() => {
        publicQueryClient.setQueryData(runtimeSettingsQueryKey, {
          ...settings,
          crispWebsiteId: id,
        })
      })
    },
  }
}

afterEach(() => {
  if (Array.isArray(window.$crisp)) {
    for (const command of commands()) {
      expect(['user:email', 'session:data', 'session:reset']).toContain(
        command[1],
      )
    }
    expect(JSON.stringify(commands())).not.toMatch(
      /chat:hide|chat:show|CRISP_TOKEN_ID|tokenId|sessionVersion|opaque-|accessUrl|subscribeToken/,
    )
  }
  document.getElementById(scriptId)?.remove()
  delete window.$crisp
  delete window.CRISP_WEBSITE_ID
})

describe('minimal Crisp consumer', () => {
  it('does not load without the runtime ID', async () => {
    setup({ configured: false })
    await waitFor(() =>
      expect(runtimeSettingsApi.getRuntimeSettings).toHaveBeenCalled(),
    )
    expect(document.getElementById(scriptId)).toBeNull()
    expect(window.$crisp).toBeUndefined()
  })

  it('loads the official async script once for anonymous visitors and rerenders', async () => {
    const { rerender } = setup()
    const script = await waitFor(() => {
      const node = document.getElementById(scriptId)
      expect(node).not.toBeNull()
      return node as HTMLScriptElement
    })
    expect(window.CRISP_WEBSITE_ID).toBe(websiteId)
    expect(window.$crisp).toEqual([])
    expect(script.src).toBe('https://client.crisp.chat/l.js')
    expect(script.async).toBe(true)
    rerender(
      <QueryClientProvider client={createQueryClient()}>
        <RuntimeSettingsProvider>
          <CrispLoader />
        </RuntimeSettingsProvider>
      </QueryClientProvider>,
    )
    expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
  })

  it('does not duplicate the loader across SPA navigation', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(settings)
    const router = createAppRouter({ initialEntries: ['/login'] })
    render(
      <AppProviders
        router={router}
        authApi={{
          login: vi.fn(),
          getCurrentUser: vi.fn().mockRejectedValue(new Error('No session')),
        }}
      />,
    )
    await waitFor(() =>
      expect(document.getElementById(scriptId)).not.toBeNull(),
    )
    await act(async () => router.navigate({ to: '/register' }))
    expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
  })

  it('publishes only approved fields when authenticated data is available', async () => {
    setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    expect(commands()).toContainEqual([
      'set',
      'user:email',
      ['member@example.com'],
    ])
    expect(sessionData()).toMatchObject({
      Plan: 'Plus',
      ExpireTime: '2030-04-05',
      UsedTraffic: '3 KB',
      AllTraffic: '10 KB',
      Balance: '¥123.45 CNY',
    })
    expect(sessionData().Client).toMatch(
      /^(Browser|Chrome|Safari|Firefox|Edge) \/ .+ \/ (Desktop|Mobile)$/,
    )
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
    expect(commands().every((command) => command[0] === 'set')).toBe(true)
  })

  it('still loads with partial metadata failures', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(settings)
    const subscription = vi
      .spyOn(subscriptionApi, 'getOverview')
      .mockRejectedValue(new Error('Subscription unavailable'))
    const wallet = vi
      .spyOn(walletApi, 'getWallet')
      .mockRejectedValue(new Error('Wallet unavailable'))
    vi.spyOn(accountApi, 'getConfig').mockRejectedValue(
      new Error('Config unavailable'),
    )
    useAuthSessionStore.setState({ accessToken: 'opaque-a', validated: true })
    const queryClient = createQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <RuntimeSettingsProvider queryClient={queryClient}>
          <CrispLoader />
          <AuthContext.Provider
            value={{
              status: 'authenticated',
              currentUser: user,
              bootstrapError: null,
              establishSession: vi.fn(),
              signIn: vi.fn(),
              retryBootstrap: vi.fn(),
              logout: vi.fn(),
              sessionInvalidated: vi.fn(),
            }}
          >
            <CrispMetadata />
          </AuthContext.Provider>
        </RuntimeSettingsProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(subscription).toHaveBeenCalled())
    await waitFor(() => expect(wallet).toHaveBeenCalled())
    expect(document.getElementById(scriptId)).not.toBeNull()
    expect(commands()).toContainEqual([
      'set',
      'user:email',
      ['member@example.com'],
    ])
    expect(Object.keys(sessionData())).toEqual(['Client'])
  })

  it('publishes available subscription fields when wallet fails', async () => {
    setup({ authenticated: true, walletUnavailable: true })
    await waitFor(() => expect(sessionData().Plan).toBe('Plus'))
    expect(sessionData()).toMatchObject({
      Plan: 'Plus',
      ExpireTime: '2030-04-05',
      UsedTraffic: '3 KB',
      AllTraffic: '10 KB',
    })
    expect(sessionData().Balance).toBeUndefined()
    expect(document.getElementById(scriptId)).not.toBeNull()
  })

  it('does not fetch authenticated business data for anonymous visitors', async () => {
    setup()
    await waitFor(() =>
      expect(document.getElementById(scriptId)).not.toBeNull(),
    )
    expect(subscriptionApi.getOverview).not.toHaveBeenCalled()
    expect(walletApi.getWallet).not.toHaveBeenCalled()
    expect(accountApi.getConfig).not.toHaveBeenCalled()
    expect(commands()).toEqual([])
  })

  it('publishes on login without resetting the anonymous session', async () => {
    const view = setup()
    await waitFor(() =>
      expect(document.getElementById(scriptId)).not.toBeNull(),
    )
    view.setUser(user)
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    expect(commands().some((command) => command[0] === 'do')).toBe(false)
  })

  it('resets once on logout without hiding or reloading the anonymous widget', async () => {
    const view = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    const before = commands().length
    view.setUser(null)
    expect(commands().slice(before)).toEqual([['do', 'session:reset']])
    view.setUser(null)
    expect(commands().slice(before)).toEqual([['do', 'session:reset']])
    expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
  })

  it('resets before publishing a different account email and business data', async () => {
    const view = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    const before = commands().length
    view.setUser({ ...user, email: 'second@example.com' })
    await waitFor(() => expect(commands().length).toBeGreaterThan(before + 3))
    const next = commands().slice(before)
    expect(next[0]).toEqual(['do', 'session:reset'])
    expect(next[1]).toEqual(['set', 'user:email', ['second@example.com']])
    expect(next.filter((command) => command[0] === 'do')).toEqual([
      ['do', 'session:reset'],
    ])
    expect(next.slice(2).every((command) => command[0] === 'set')).toBe(true)
  })

  it('does not reset for the same user rerender or metadata refresh', async () => {
    const view = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    view.setUser({ ...user })
    await act(async () => view.queryClient.invalidateQueries())
    expect(commands().every((command) => command[0] === 'set')).toBe(true)
  })

  it('does not publish the next account if the reset command cannot be issued', async () => {
    const view = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    const next: unknown[] = []
    const push = vi.fn((command: unknown) => {
      next.push(command)
      throw new Error('SDK push unavailable')
    })
    window.$crisp = { push }
    view.setUser({ ...user, email: 'second@example.com' })
    await waitFor(() => expect(walletApi.getWallet).toHaveBeenCalledTimes(2))
    expect(next).toEqual([['do', 'session:reset']])
    expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
  })

  it.each([null, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'])(
    'stops metadata without resetting or reloading when runtime ID becomes %s',
    async (id) => {
      const view = setup({ authenticated: true })
      await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
      const before = commands().length
      view.setWebsiteId(id)
      view.setUser({ ...user, email: 'second@example.com' })
      await act(async () => view.queryClient.invalidateQueries())
      expect(commands()).toHaveLength(before)
      expect(window.CRISP_WEBSITE_ID).toBe(websiteId)
      expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
    },
  )

  it('does not reset or reload on a same-ID runtime refetch', async () => {
    const view = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    view.setWebsiteId(websiteId)
    expect(commands().every((command) => command[0] === 'set')).toBe(true)
    expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
  })

  it('contains no token continuity, auth generation machinery or extra session commands', () => {
    const source = [loaderSource, metadataSource, scriptSource].join('\n')
    expect(source).not.toMatch(
      /chat:hide|chat:show|CRISP_TOKEN_ID|tokenId|previousIdentity|generation|sessionVersion|subscribeToken|accessUrl/,
    )
    expect(source.match(/issue\(\['do', 'session:reset'\]\)/g)).toHaveLength(1)
  })

  it('fails closed when the SDK queue disappears before an account switch', async () => {
    const view = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    delete window.$crisp
    view.setUser({ ...user, email: 'second@example.com' })
    await waitFor(() => expect(walletApi.getWallet).toHaveBeenCalledTimes(2))
    expect(window.$crisp).toBeUndefined()
    expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
  })

  it('does not publish business data when setting the first email throws', async () => {
    const view = setup()
    await waitFor(() =>
      expect(document.getElementById(scriptId)).not.toBeNull(),
    )
    const next: unknown[] = []
    window.$crisp = {
      push(command: CrispCommand) {
        next.push(command)
        throw new Error('Email push failed')
      },
    }
    view.setUser(user)
    await waitFor(() => expect(walletApi.getWallet).toHaveBeenCalled())
    expect(next).toEqual([['set', 'user:email', [user.email]]])
  })

  it('resets once through the real AuthProvider logout and keeps public settings', async () => {
    const prepared = setup({ authenticated: true })
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    prepared.unmount()
    window.$crisp = []
    useAuthSessionStore.getState().clearAccessToken()
    let signedIn = true
    function Logout() {
      const { logout, status } = useAuth()
      return <button onClick={logout}>{status}</button>
    }
    render(
      <QueryClientProvider client={createQueryClient()}>
        <RuntimeSettingsProvider>
          <CrispLoader />
          <AuthProvider
            api={{
              login: vi.fn(),
              getCurrentUser: vi.fn(async () => {
                if (signedIn) return user
                throw new ApiError({
                  status: 401,
                  code: 'AUTH_REQUIRED',
                  message: 'Authentication required',
                })
              }),
              logout: vi.fn(async () => {
                signedIn = false
              }),
            }}
          >
            <CrispMetadata />
            <Logout />
          </AuthProvider>
        </RuntimeSettingsProvider>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(sessionData().Balance).toBe('¥123.45 CNY'))
    const before = commands().length
    await act(async () =>
      screen.getByRole('button', { name: 'authenticated' }).click(),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'unauthenticated' }),
      ).toBeInTheDocument(),
    )
    expect(commands().slice(before)).toEqual([['do', 'session:reset']])
    expect(document.querySelectorAll(`#${scriptId}`)).toHaveLength(1)
    expect(window.CRISP_WEBSITE_ID).toBe(websiteId)
  })
})
