import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { Brand } from '@/components/layout/brand'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { authQueryKeys } from '@/features/auth/auth-query-keys'
import { useRuntimeSettings } from '@/features/runtime-settings/runtime-settings-context'
import { compiledRuntimeSettings } from '@/features/runtime-settings/runtime-settings-model'
import { RuntimeSettingsProvider } from '@/features/runtime-settings/runtime-settings-provider'
import {
  runtimeSettingsApi,
  type RuntimeSettings,
} from '@/features/runtime-settings/runtime-settings-api'
import { runtimeSettingsQueryKey } from '@/features/runtime-settings/runtime-settings-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const allNullSettings: RuntimeSettings = {
  siteName: null,
  brandName: null,
  title: null,
  description: null,
  logoUrl: null,
  faviconUrl: null,
  footerText: null,
}

const configuredSettings: RuntimeSettings = {
  siteName: 'Aureole Services',
  brandName: 'Aureole Plus',
  title: 'Aureole Plus Portal',
  description: 'Managed access for members.',
  logoUrl: 'https://assets.example.com/logo.png',
  faviconUrl: 'https://assets.example.com/favicon.ico',
  footerText: 'Aureole Services',
}

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

function createNoRetryQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

function RuntimeHarness() {
  const settings = useRuntimeSettings()

  return (
    <div>
      <Brand />
      <output data-testid="runtime-title">{settings.documentTitle}</output>
      <output data-testid="runtime-footer">{settings.footerText}</output>
    </div>
  )
}

function renderRuntime(queryClient: QueryClient = createNoRetryQueryClient()) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RuntimeSettingsProvider>
        <RuntimeHarness />
      </RuntimeSettingsProvider>
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}

function createAuthApi(): AuthApi {
  return {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
  }
}

function renderRoute(
  path: string,
  queryClient: QueryClient = createQueryClient(),
) {
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={createAuthApi()}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('Runtime Settings presentation', () => {
  it('keeps compiled defaults while the anonymous Query is pending', async () => {
    const result = deferred<RuntimeSettings>()
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockReturnValue(
      result.promise,
    )
    renderRuntime()

    expect(screen.getAllByText('Aureole')).not.toHaveLength(0)
    expect(screen.getByTestId('runtime-title')).toHaveTextContent('Aureole')
    expect(document.title).toBe('Aureole')
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute('content', compiledRuntimeSettings.description)
    expect(screen.queryByText('正在加载运行时设置')).toBeNull()

    await act(async () => result.resolve(allNullSettings))
  })

  it('uses compiled defaults for error and all-null responses', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Unexpected anonymous error',
      }),
    )
    const { unmount } = renderRuntime()

    await waitFor(() =>
      expect(runtimeSettingsApi.getRuntimeSettings).toHaveBeenCalledTimes(1),
    )
    expect(screen.getAllByText('Aureole')).not.toHaveLength(0)
    expect(document.title).toBe('Aureole')
    unmount()

    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(
      allNullSettings,
    )
    renderRuntime()
    await waitFor(() =>
      expect(screen.getAllByText('Aureole')).not.toHaveLength(0),
    )
    expect(document.title).toBe('Aureole')
    expect(document.querySelector('img')).toBeNull()
    expect(
      document.head.querySelector('[data-runtime-settings-favicon="true"]'),
    ).toBeNull()
  })

  it('maps runtime fields to Brand, document metadata and footer semantics', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(
      configuredSettings,
    )
    renderRuntime()

    expect(await screen.findByText('Aureole Plus')).toBeInTheDocument()
    expect(screen.getByTestId('runtime-title')).toHaveTextContent(
      'Aureole Plus Portal',
    )
    expect(screen.getByTestId('runtime-footer')).toHaveTextContent(
      'Aureole Services',
    )
    expect(document.title).toBe('Aureole Plus Portal')
    expect(
      document.head.querySelectorAll('meta[name="description"]'),
    ).toHaveLength(1)
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute('content', 'Managed access for members.')

    const logo = document.querySelector<HTMLImageElement>('img')
    expect(logo).toHaveAttribute('src', configuredSettings.logoUrl)
    expect(logo).toHaveAttribute('alt', '')
    expect(logo).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.queryByRole('img')).toBeNull()

    const favicon = document.head.querySelector<HTMLLinkElement>(
      '[data-runtime-settings-favicon="true"]',
    )
    expect(favicon).toHaveAttribute('href', configuredSettings.faviconUrl)
    expect(favicon).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('falls back to siteName for brand, title and footer when overrides are null', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue({
      ...allNullSettings,
      siteName: 'Aureole Services',
    })
    renderRuntime()

    expect(await screen.findAllByText('Aureole Services')).not.toHaveLength(0)
    expect(screen.getByTestId('runtime-title')).toHaveTextContent(
      'Aureole Services',
    )
    expect(screen.getByTestId('runtime-footer')).toHaveTextContent(
      'Aureole Services',
    )
    expect(document.title).toBe('Aureole Services')
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute('content', compiledRuntimeSettings.description)
  })

  it('falls back after a broken logo and retries the current authoritative URL', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(
      configuredSettings,
    )
    const { queryClient } = renderRuntime()

    const firstLogo = await waitFor(() => {
      const image = document.querySelector<HTMLImageElement>('img')
      expect(image).toHaveAttribute('src', configuredSettings.logoUrl)
      return image!
    })
    fireEvent.error(firstLogo)
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('svg.lucide-orbit')).not.toBeNull()

    const nextLogoUrl = 'https://assets.example.com/logo-next.png'
    act(() => {
      queryClient.setQueryData(runtimeSettingsQueryKey, {
        ...configuredSettings,
        logoUrl: nextLogoUrl,
      })
    })

    await waitFor(() =>
      expect(document.querySelector('img')).toHaveAttribute('src', nextLogoUrl),
    )
  })

  it('owns only its favicon override and does not probe logo or favicon URLs', async () => {
    const unrelatedIcon = document.createElement('link')
    unrelatedIcon.rel = 'icon'
    unrelatedIcon.href = 'https://static.example.com/unrelated.ico'
    document.head.append(unrelatedIcon)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(
      configuredSettings,
    )
    const { queryClient } = renderRuntime()

    await waitFor(() =>
      expect(
        document.head.querySelector('[data-runtime-settings-favicon="true"]'),
      ).not.toBeNull(),
    )
    act(() =>
      queryClient.setQueryData(runtimeSettingsQueryKey, allNullSettings),
    )

    await waitFor(() =>
      expect(
        document.head.querySelector('[data-runtime-settings-favicon="true"]'),
      ).toBeNull(),
    )
    expect(document.title).toBe(compiledRuntimeSettings.title)
    expect(
      document.head.querySelector('meta[name="description"]'),
    ).toHaveAttribute('content', compiledRuntimeSettings.description)
    expect(document.head.contains(unrelatedIcon)).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
    unrelatedIcon.remove()
  })

  it('keeps public Login usable while Runtime Settings remains pending', async () => {
    const result = deferred<RuntimeSettings>()
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockReturnValue(
      result.promise,
    )
    renderRoute('/login')

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(document.title).toBe('Aureole')
    await act(async () => result.resolve(allNullSettings))
  })

  it('uses the existing PublicLayout footer slot without adding a siteName block', async () => {
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockResolvedValue(
      configuredSettings,
    )
    renderRoute('/login')

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(await screen.findAllByText('Aureole Plus')).not.toHaveLength(0)
    expect(screen.getAllByText('Aureole Services')).toHaveLength(1)
    expect(screen.getByText('Return to sign in')).toBeInTheDocument()
  })

  it('keeps the authenticated AppShell and Auth state when Runtime Settings fails', async () => {
    window.sessionStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      'stored-session-token',
    )
    vi.mocked(runtimeSettingsApi.getRuntimeSettings).mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Unexpected anonymous error',
      }),
    )
    const queryClient = createNoRetryQueryClient()
    const { router } = renderRoute('/dashboard', queryClient)

    expect(
      await screen.findByRole('heading', { name: 'Overview' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/dashboard')
    expect(useAuthSessionStore.getState().accessToken).toBe(
      'stored-session-token',
    )
    expect(queryClient.getQueryData(authQueryKeys.me)).toEqual(currentUser)
  })
})
