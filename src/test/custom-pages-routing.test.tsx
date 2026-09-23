import type { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import {
  customPagesApi,
  type CustomPage,
} from '@/features/custom-pages/custom-pages-api'
import { customPagesQueryKey } from '@/features/custom-pages/custom-pages-queries'
import { noticesApi } from '@/features/notices/notices-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { ApiError } from '@/lib/api/errors'

const iframePage: CustomPage = {
  id: 'notice-6',
  title: '使用指南',
  url: 'https://docs.example.com/guide?lang=zh#start',
  mode: 'iframe',
}
const externalPage: CustomPage = {
  id: 'notice-8',
  title: '外部状态',
  url: 'https://status.example.com/current',
  mode: 'external',
}
const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

function renderRoute(
  path: string,
  queryClient: QueryClient = createQueryClient(),
  session = { current: true },
) {
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockImplementation(() =>
      session.current
        ? Promise.resolve(currentUser)
        : Promise.reject(
            new ApiError({
              status: 401,
              code: 'AUTH_REQUIRED',
              message: 'Authentication required',
            }),
          ),
    ),
  }
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { authApi, queryClient, router, session }
}

function primaryNavigation() {
  return screen.findByRole('navigation', { name: 'Primary' })
}

function mockDashboardReads() {
  vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue({
    product: null,
    expiresAt: null,
    traffic: {
      uploadedBytes: 0,
      downloadedBytes: 0,
      allowanceBytes: 0,
    },
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
}

describe('Dynamic Custom Page navigation and routing', () => {
  it('renders server-ordered iframe and external items on desktop and mobile', async () => {
    vi.mocked(customPagesApi.getList).mockResolvedValue({
      items: [externalPage, iframePage],
    })
    renderRoute('/custom/notice-6')

    const desktopNav = await primaryNavigation()
    await within(desktopNav).findByRole('link', { name: '使用指南' })
    const labels = within(desktopNav)
      .getAllByRole('link')
      .map((link) => link.textContent?.replace('（在新窗口打开）', ''))
    expect(labels.slice(-3)).toEqual(['外部状态', '使用指南', 'Account'])

    const external = within(desktopNav).getByRole('link', { name: /外部状态/ })
    expect(external).toHaveAttribute('href', externalPage.url)
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener noreferrer')
    expect(external).not.toHaveAttribute('href', '/custom/notice-8')
    expect(
      within(desktopNav).getByRole('link', { name: '使用指南' }),
    ).toHaveAttribute('href', '/custom/notice-6')

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const sheet = screen.getByRole('dialog', { name: 'Navigation' })
    expect(
      within(sheet).getByRole('link', { name: '使用指南' }),
    ).toHaveAttribute('href', '/custom/notice-6')
    expect(
      within(sheet).getByRole('link', { name: /外部状态/ }),
    ).toHaveAttribute('target', '_blank')
    expect(customPagesApi.getList).toHaveBeenCalledTimes(1)
  })

  it('shows direct-route loading without blocking the authenticated shell', async () => {
    vi.mocked(customPagesApi.getList).mockReturnValue(new Promise(() => {}))
    renderRoute('/custom/notice-6')

    expect(await screen.findByText('正在读取页面…')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Aureole',
    )
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('renders an authoritative iframe with the existing security boundary', async () => {
    vi.mocked(customPagesApi.getList).mockResolvedValue({ items: [iframePage] })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { router } = renderRoute('/custom/notice-6')

    expect(
      await screen.findByRole('heading', { level: 1, name: '使用指南' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/custom/notice-6')
    expect(document.querySelector('main')).toHaveAttribute(
      'data-layout',
      'custom-page',
    )

    const iframe = document.querySelector('iframe')
    expect(iframe).toHaveAttribute('src', iframePage.url)
    expect(iframe).toHaveAttribute('title', iframePage.title)
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(iframe).not.toHaveAttribute('sandbox')
    expect(iframe).not.toHaveAttribute('allow')

    const fallback = screen.getByRole('link', { name: '在新窗口打开' })
    expect(fallback).toHaveAttribute('href', iframePage.url)
    expect(fallback).toHaveAttribute('target', '_blank')
    expect(fallback).toHaveAttribute('rel', 'noopener noreferrer')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('keeps the iframe loading state honest until its load event', async () => {
    vi.mocked(customPagesApi.getList).mockResolvedValue({ items: [iframePage] })
    renderRoute('/custom/notice-6')
    const iframe = await waitFor(() => {
      const element = document.querySelector('iframe')
      expect(element).not.toBeNull()
      return element!
    })

    expect(screen.getByText('正在加载页面…')).toHaveAttribute('role', 'status')
    iframe.dispatchEvent(new Event('load', { bubbles: true }))
    await waitFor(() => expect(screen.queryByText('正在加载页面…')).toBeNull())
  })

  it.each([
    ['unknown ID', [iframePage], '/custom/notice-404'],
    ['external ID', [externalPage], '/custom/notice-8'],
  ])(
    'shows unavailable without redirecting for %s',
    async (_case, items, path) => {
      vi.mocked(customPagesApi.getList).mockResolvedValue({ items })
      const { router } = renderRoute(path)

      expect(await screen.findByText('页面不可用')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '返回概览' })).toHaveAttribute(
        'href',
        '/dashboard',
      )
      expect(document.querySelector('iframe')).toBeNull()
      expect(screen.queryByRole('link', { name: '在新窗口打开' })).toBeNull()
      expect(router.state.location.pathname).toBe(path)
    },
  )

  it('shows a safe direct-route error and retries explicitly', async () => {
    const safeError = new ApiError({
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'private upstream detail',
    })
    vi.mocked(customPagesApi.getList)
      .mockRejectedValueOnce(safeError)
      .mockResolvedValueOnce({ items: [iframePage] })
    renderRoute('/custom/notice-6')

    expect(await screen.findByText('暂时无法加载此页面。')).toBeInTheDocument()
    expect(screen.queryByText('private upstream detail')).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() =>
      expect(document.querySelector('iframe')).toHaveAttribute(
        'src',
        iframePage.url,
      ),
    )
    expect(customPagesApi.getList).toHaveBeenCalledTimes(2)
  })

  it('adds a page after authoritative refetch without rebuild', async () => {
    vi.mocked(customPagesApi.getList)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [iframePage] })
    const { queryClient } = renderRoute('/custom/notice-6')

    expect(await screen.findByText('页面不可用')).toBeInTheDocument()
    expect(within(await primaryNavigation()).queryByText('使用指南')).toBeNull()

    await queryClient.invalidateQueries({ queryKey: customPagesQueryKey })

    await waitFor(() =>
      expect(document.querySelector('iframe')).toHaveAttribute(
        'src',
        iframePage.url,
      ),
    )
    expect(
      within(await primaryNavigation()).getByText('使用指南'),
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' }),
    )
    expect(
      within(screen.getByRole('dialog', { name: 'Navigation' })).getByText(
        '使用指南',
      ),
    ).toBeVisible()
  })

  it('updates title, URL and fallback for the same stable route ID', async () => {
    const editedPage: CustomPage = {
      ...iframePage,
      title: '新教程',
      url: 'https://new.example.com/current',
    }
    vi.mocked(customPagesApi.getList)
      .mockResolvedValueOnce({ items: [iframePage] })
      .mockResolvedValueOnce({ items: [editedPage] })
    const { queryClient, router } = renderRoute('/custom/notice-6')

    expect(
      await screen.findByRole('heading', { level: 1, name: '使用指南' }),
    ).toBeInTheDocument()
    await queryClient.invalidateQueries({ queryKey: customPagesQueryKey })

    expect(
      await screen.findByRole('heading', { level: 1, name: '新教程' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/custom/notice-6')
    expect(document.querySelector('iframe')).toHaveAttribute(
      'src',
      editedPage.url,
    )
    expect(document.querySelector('iframe')).toHaveAttribute(
      'title',
      editedPage.title,
    )
    expect(screen.getByRole('link', { name: '在新窗口打开' })).toHaveAttribute(
      'href',
      editedPage.url,
    )
    expect(within(await primaryNavigation()).getByText('新教程')).toBeVisible()
    expect(within(await primaryNavigation()).queryByText('使用指南')).toBeNull()
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Navigation' })
    expect(within(sheet).getByText('新教程')).toBeVisible()
    expect(within(sheet).queryByText('使用指南')).toBeNull()
  })

  it('removes navigation and the current iframe after authoritative removal', async () => {
    vi.mocked(customPagesApi.getList)
      .mockResolvedValueOnce({ items: [iframePage] })
      .mockResolvedValueOnce({ items: [] })
    const { queryClient } = renderRoute('/custom/notice-6')

    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull())
    await userEvent.click(
      screen.getByRole('button', { name: 'Open navigation' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Navigation' })
    expect(within(sheet).getByText('使用指南')).toBeVisible()
    await queryClient.invalidateQueries({ queryKey: customPagesQueryKey })

    expect(await screen.findByText('页面不可用')).toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
    expect(within(await primaryNavigation()).queryByText('使用指南')).toBeNull()
    expect(within(sheet).queryByText('使用指南')).toBeNull()
    await userEvent.click(
      within(sheet).getByRole('button', { name: 'Close navigation' }),
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Aureole',
    )
  })

  it('keeps credentials out of URLs, query keys and DOM metadata', async () => {
    const token = 'opaque-session-token'
    vi.mocked(customPagesApi.getList).mockResolvedValue({
      items: [iframePage, externalPage],
    })
    renderRoute('/custom/notice-6')
    await screen.findByRole('heading', { level: 1, name: '使用指南' })

    const iframe = document.querySelector('iframe')
    const external = screen.getByRole('link', { name: /外部状态/ })
    const fallback = screen.getByRole('link', { name: '在新窗口打开' })
    expect(iframe?.getAttribute('src')).not.toContain(token)
    expect(external.getAttribute('href')).not.toContain(token)
    expect(fallback.getAttribute('href')).not.toContain(token)
    expect(document.body.textContent).not.toContain(token)
    expect(window.location.search).not.toContain(token)
    expect(JSON.stringify(customPagesQueryKey)).not.toContain(token)
  })

  it.each([
    ['empty success', () => Promise.resolve({ items: [] }), 1],
    [
      'server error',
      () =>
        Promise.reject(
          new ApiError({ status: 500, code: 'UPSTREAM_ERROR', message: 'x' }),
        ),
      2,
    ],
    [
      'network error',
      () =>
        Promise.reject(
          new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'x' }),
        ),
      2,
    ],
    [
      'malformed response',
      () =>
        Promise.reject(
          new ApiError({
            status: 200,
            code: 'MALFORMED_RESPONSE',
            message: 'x',
          }),
        ),
      1,
    ],
  ])(
    'does not block ordinary pages or restore static items on %s',
    async (_case, result, expectedCalls) => {
      mockDashboardReads()
      vi.mocked(customPagesApi.getList).mockImplementation(result)
      renderRoute('/dashboard')

      expect(
        await screen.findByRole('heading', { name: '概览' }),
      ).toBeInTheDocument()
      await waitFor(
        () =>
          expect(customPagesApi.getList).toHaveBeenCalledTimes(expectedCalls),
        { timeout: 3_000 },
      )
      const nav = await primaryNavigation()
      expect(within(nav).queryByText('使用指南')).toBeNull()
      expect(within(nav).queryByText('外部状态')).toBeNull()
      expect(within(nav).getByRole('link', { name: 'Account' })).toBeVisible()
      expect(document.querySelector('main')).toHaveAttribute(
        'data-layout',
        'standard',
      )
    },
  )

  it('does not block an ordinary page while Custom Pages remains pending', async () => {
    mockDashboardReads()
    vi.mocked(customPagesApi.getList).mockReturnValue(new Promise(() => {}))
    renderRoute('/dashboard')

    expect(
      await screen.findByRole('heading', { name: '概览' }),
    ).toBeInTheDocument()
    expect(within(await primaryNavigation()).getByText('Account')).toBeVisible()
  })

  it('fails closed and removes a stale iframe when refetch errors', async () => {
    vi.mocked(customPagesApi.getList)
      .mockResolvedValueOnce({ items: [iframePage] })
      .mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'private detail',
        }),
      )
    const { queryClient } = renderRoute('/custom/notice-6')

    await waitFor(() => expect(document.querySelector('iframe')).not.toBeNull())
    await queryClient.invalidateQueries({ queryKey: customPagesQueryKey })

    expect(await screen.findByText('暂时无法加载此页面。')).toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
    expect(within(await primaryNavigation()).queryByText('使用指南')).toBeNull()
  })

  it('reuses the sealed invalid-session exit path', async () => {
    const session = { current: true }
    vi.mocked(customPagesApi.getList).mockImplementation(() => {
      session.current = false
      return Promise.reject(
        new ApiError({
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'private auth detail',
        }),
      )
    })
    renderRoute('/custom/notice-6', createQueryClient(), session)

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    expect(screen.queryByText('private auth detail')).toBeNull()
  })
})
