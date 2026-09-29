import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi } from '@/features/auth/auth-api'
import {
  customPagesApi,
  type CustomPage,
} from '@/features/custom-pages/custom-pages-api'
import { downloadsApi } from '@/features/downloads/downloads-api'
import {
  navigationApi,
  type NavigationData,
} from '@/features/navigation/navigation-api'
import { noticesApi } from '@/features/notices/notices-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { ApiError } from '@/lib/api/errors'

const iframe: CustomPage = {
  id: 'test-page',
  title: 'Old TEST title',
  url: 'https://docs.example.com/test',
  mode: 'iframe',
}
const external: CustomPage = {
  id: 'external-page',
  title: 'Old external title',
  url: 'https://status.example.com/',
  mode: 'external',
}
const core = (targetId: string, label = targetId) => ({
  kind: 'core' as const,
  targetId,
  label,
})
const custom = (itemId: string, label = itemId) => ({
  kind: 'custom-page' as const,
  itemId,
  label,
})
const dynamic: NavigationData = {
  items: [
    core('dashboard', 'Overview'),
    custom('test-page', 'TEST Page'),
    core('plans', 'Plans'),
    core('subscription', 'Subscription'),
    custom('external-page', 'External Status'),
    core('help-center', 'TEST Help Desk'),
    core('download-center', 'Download Center'),
  ],
}

function installShellReads() {
  vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue({
    product: null,
    expiresAt: null,
    traffic: { uploadedBytes: 0, downloadedBytes: 0, allowanceBytes: 0 },
    deviceLimit: null,
    activeDevices: 0,
    resetDay: null,
    renewalAllowed: false,
  })
  vi.spyOn(noticesApi, 'getList').mockResolvedValue({
    items: [],
    page: 1,
    pageSize: 1,
    total: 0,
  })
  vi.spyOn(customPagesApi, 'getList').mockResolvedValue({
    items: [iframe, external],
  })
}

function renderRoute(path = '/dashboard', valid = { current: true }) {
  window.sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    'opaque-session-token',
  )
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn(async () => {
      if (!valid.current)
        throw new ApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: 'Expired',
        })
      return {
        email: 'member@example.com',
        expiresAt: '2030-01-01T00:00:00.000Z',
        status: 'active' as const,
      }
    }),
  }
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={createQueryClient()}
    />,
  )
  return router
}

function labels(nav: HTMLElement) {
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent?.replace('（在新窗口打开）', '').trim())
}

describe('Navigation Registry in AppShell', () => {
  it('shares exact dynamic presentation across desktop and mobile with fixed Account last', async () => {
    installShellReads()
    vi.mocked(navigationApi.getList).mockResolvedValue(dynamic)
    renderRoute()
    const expected = [
      'Overview',
      'TEST Page',
      'Plans',
      'Subscription',
      'External Status',
      'TEST Help Desk',
      'Download Center',
      'Account',
    ]
    const desktop = await screen.findByRole('navigation', { name: 'Primary' })
    await waitFor(() => expect(labels(desktop)).toEqual(expected))
    expect(within(desktop).queryByRole('link', { name: 'Support' })).toBeNull()
    expect(
      within(desktop).getByRole('link', { name: 'TEST Page' }),
    ).toHaveAttribute('href', '/custom/test-page')
    expect(
      within(desktop).getByRole('link', { name: /External Status/ }),
    ).toHaveAttribute('href', external.url)
    expect(
      within(desktop).getByRole('link', { name: /External Status/ }),
    ).toHaveAttribute('rel', 'noopener noreferrer')
    expect(
      within(desktop).getByRole('link', { name: 'Download Center' }),
    ).toHaveAttribute('href', '/downloads')
    expect(
      within(desktop).getByRole('link', { name: 'Account' }),
    ).toHaveAttribute('href', '/settings')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const sheet = screen.getByRole('dialog', { name: 'Navigation' })
    const mobile = within(sheet).getByRole('navigation', { name: 'Primary' })
    expect(labels(mobile)).toEqual(expected)
    await user.click(within(mobile).getByRole('link', { name: 'TEST Page' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull(),
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'TEST Page',
    )
  })

  it('keeps hidden Support directly reachable with its code-owned title', async () => {
    installShellReads()
    vi.mocked(navigationApi.getList).mockResolvedValue(dynamic)
    const router = renderRoute('/support')
    await waitFor(() =>
      expect(
        labels(screen.getByRole('navigation', { name: 'Primary' })),
      ).toContain('TEST Help Desk'),
    )
    expect(router.state.location.pathname).toBe('/support')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Support',
    )
    expect(screen.queryByRole('link', { name: 'Support' })).toBeNull()
  })

  it('keeps dynamic core items while Custom Pages are loading or fail', async () => {
    installShellReads()
    vi.mocked(navigationApi.getList).mockResolvedValue(dynamic)
    let resolvePages!: (value: { items: CustomPage[] }) => void
    vi.mocked(customPagesApi.getList).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePages = resolve
        }),
    )
    renderRoute()
    const desktop = await screen.findByRole('navigation', { name: 'Primary' })
    await waitFor(() =>
      expect(labels(desktop)).toEqual([
        'Overview',
        'Plans',
        'Subscription',
        'TEST Help Desk',
        'Download Center',
        'Account',
      ]),
    )
    expect(labels(desktop)).not.toContain('TEST Page')
    resolvePages({ items: [iframe, external] })
    await waitFor(() => expect(labels(desktop)[1]).toBe('TEST Page'))
  })

  it('does not let a Custom Pages read error erase successful core navigation', async () => {
    installShellReads()
    vi.mocked(navigationApi.getList).mockResolvedValue(dynamic)
    vi.mocked(customPagesApi.getList).mockRejectedValue(
      new ApiError({
        status: 400,
        code: 'CUSTOM_PAGES_UNAVAILABLE',
        message: 'Unavailable',
      }),
    )
    renderRoute()
    const desktop = await screen.findByRole('navigation', { name: 'Primary' })
    await waitFor(() => expect(labels(desktop)).toContain('TEST Help Desk'))
    expect(labels(desktop)).toEqual([
      'Overview',
      'Plans',
      'Subscription',
      'TEST Help Desk',
      'Download Center',
      'Account',
    ])
  })

  it('uses dynamic Help title but leaves the public Downloads route unchanged', async () => {
    installShellReads()
    vi.mocked(navigationApi.getList).mockResolvedValue(dynamic)
    vi.spyOn(downloadsApi, 'getDownloads').mockResolvedValue({
      items: [
        {
          id: 'clashbox-harmonyos',
          label: 'ClashBox',
          platform: 'harmonyos',
          arch: null,
          version: '1.0.0',
          publishedAt: null,
          filename: 'app.hap',
          sizeBytes: 1,
          downloads: [
            {
              id: 'primary',
              label: '下载',
              url: 'https://downloads.example.com/app.hap',
            },
            {
              id: 'backup',
              label: '备用',
              url: 'https://backup.example.com/app.hap',
            },
          ],
        },
      ],
    })
    const router = renderRoute('/help/12')
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'TEST Help Desk',
      ),
    )
    const user = userEvent.setup()
    await user.click(
      screen
        .getByRole('navigation', { name: 'Primary' })
        .querySelector<HTMLAnchorElement>('a[href="/downloads"]')!,
    )
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/downloads'),
    )
    expect(
      await screen.findByRole('heading', { name: 'HarmonyOS' }),
    ).toBeInTheDocument()
    expect(screen.getByText('ClashBox')).toBeInTheDocument()
  })

  it('keeps compiled navigation during loading and after transient or malformed failure', async () => {
    installShellReads()
    let reject!: (error: unknown) => void
    vi.mocked(navigationApi.getList).mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    renderRoute()
    const desktop = await screen.findByRole('navigation', { name: 'Primary' })
    await within(desktop).findByRole('link', { name: 'Old TEST title' })
    expect(labels(desktop).slice(0, 4)).toEqual([
      'Overview',
      'Subscription',
      'Plans',
      'Resources',
    ])
    expect(labels(desktop).slice(-3)).toEqual([
      'Old TEST title',
      'Old external title',
      'Account',
    ])
    expect(labels(desktop)).not.toContain('Download Center')
    reject(
      new ApiError({
        status: 400,
        code: 'MALFORMED_RESPONSE',
        message: 'Invalid',
      }),
    )
    await waitFor(() => expect(labels(desktop).at(-1)).toBe('Account'))
    expect(screen.queryByText('导航不可用')).toBeNull()
  })

  it('lets existing auth invalidation handle a confirmed Navigation 401', async () => {
    installShellReads()
    let reject!: (error: unknown) => void
    vi.mocked(navigationApi.getList).mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    const valid = { current: true }
    const router = renderRoute('/dashboard', valid)
    await screen.findByRole('navigation', { name: 'Primary' })
    await waitFor(() => expect(navigationApi.getList).toHaveBeenCalled())
    valid.current = false
    reject(
      new ApiError({ status: 401, code: 'AUTH_FAILED', message: 'Expired' }),
    )
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
  })
})
