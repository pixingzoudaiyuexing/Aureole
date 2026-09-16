import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { noticesApi } from '@/features/notices/notices-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const customPageFixtures = vi.hoisted(() => [
  {
    id: 'guide',
    title: '使用指南',
    url: 'https://docs.example.com/guide?lang=zh#start',
    mode: 'iframe' as const,
    enabled: true,
    order: 20,
    icon: 'book' as const,
  },
  {
    id: 'status',
    title: '外部状态',
    url: 'https://status.example.com/current',
    mode: 'external' as const,
    enabled: true,
    order: 10,
    icon: 'activity' as const,
  },
  {
    id: 'hidden',
    title: '隐藏页面',
    url: 'https://hidden.example.com',
    mode: 'iframe' as const,
    enabled: false,
    icon: 'panel' as const,
  },
])

vi.mock('@/config/custom-pages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/custom-pages')>()
  const pages = actual.validateCustomPages(customPageFixtures)
  return {
    ...actual,
    customPages: pages,
    getIframeCustomPageById: (id: string) =>
      actual.getIframeCustomPageById(id, pages),
  }
})

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

function renderRoute(path: string) {
  window.sessionStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    'opaque-session-token',
  )
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
  }
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={createQueryClient()}
    />,
  )
  return { authApi, router }
}

describe('Custom Page navigation and routing', () => {
  it('renders ordered iframe and external items before Account', async () => {
    renderRoute('/custom/guide')
    const nav = await screen.findByRole('navigation', { name: 'Primary' })
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent?.replace('（在新窗口打开）', ''))

    expect(labels.slice(-3)).toEqual(['外部状态', '使用指南', 'Account'])
    expect(within(nav).queryByText('隐藏页面')).toBeNull()

    const external = within(nav).getByRole('link', { name: /外部状态/ })
    expect(external).toHaveAttribute(
      'href',
      'https://status.example.com/current',
    )
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', 'noopener noreferrer')
    expect(external).not.toHaveAttribute('href', '/custom/status')

    expect(within(nav).getByRole('link', { name: '使用指南' })).toHaveAttribute(
      'href',
      '/custom/guide',
    )
  })

  it('renders an enabled iframe page in the authenticated full-content shell', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { router } = renderRoute('/custom/guide')

    expect(
      await screen.findByRole('heading', { level: 1, name: '使用指南' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/custom/guide')
    expect(document.querySelector('main')).toHaveAttribute(
      'data-layout',
      'custom-page',
    )

    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe).toHaveAttribute(
      'src',
      'https://docs.example.com/guide?lang=zh#start',
    )
    expect(iframe).toHaveAttribute('title', '使用指南')
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(iframe).not.toHaveAttribute('sandbox')
    expect(iframe).not.toHaveAttribute('allow')

    const fallback = screen.getByRole('link', { name: '在新窗口打开' })
    expect(fallback).toHaveAttribute(
      'href',
      'https://docs.example.com/guide?lang=zh#start',
    )
    expect(fallback).toHaveAttribute('target', '_blank')
    expect(fallback).toHaveAttribute('rel', 'noopener noreferrer')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows honest loading state until the observed iframe load event', async () => {
    renderRoute('/custom/guide')
    const iframe = await waitFor(() => {
      const element = document.querySelector('iframe')
      expect(element).not.toBeNull()
      return element!
    })

    expect(screen.getByText('正在加载页面…')).toHaveAttribute('role', 'status')
    iframe.dispatchEvent(new Event('load', { bubbles: true }))
    await waitFor(() => expect(screen.queryByText('正在加载页面…')).toBeNull())
    expect(
      screen.getByText('如果页面无法正常显示，请在新窗口打开。'),
    ).toBeInTheDocument()
  })

  it.each(['/custom/missing', '/custom/hidden', '/custom/status'])(
    'rejects direct iframe rendering for %s',
    async (path) => {
      renderRoute(path)
      expect(await screen.findByText('页面不可用')).toBeInTheDocument()
      expect(document.querySelector('iframe')).toBeNull()
      expect(screen.queryByRole('link', { name: '在新窗口打开' })).toBeNull()
    },
  )

  it('keeps session credentials out of custom page URLs and metadata', async () => {
    const token = 'opaque-session-token'
    renderRoute('/custom/guide')
    await screen.findByRole('heading', { level: 1, name: '使用指南' })

    const iframe = document.querySelector('iframe')
    const external = screen.getByRole('link', { name: /外部状态/ })
    const fallback = screen.getByRole('link', { name: '在新窗口打开' })
    expect(iframe?.getAttribute('src')).not.toContain(token)
    expect(external.getAttribute('href')).not.toContain(token)
    expect(fallback.getAttribute('href')).not.toContain(token)
    expect(document.body.textContent).not.toContain(token)
    expect(window.location.search).not.toContain(token)
  })

  it('includes Custom Pages in the existing mobile navigation sheet', async () => {
    renderRoute('/custom/guide')
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Open navigation' }),
    )
    const sheet = screen.getByRole('dialog', { name: 'Navigation' })

    expect(
      within(sheet).getByRole('link', { name: '使用指南' }),
    ).toHaveAttribute('href', '/custom/guide')
    expect(
      within(sheet).getByRole('link', { name: /外部状态/ }),
    ).toHaveAttribute('target', '_blank')
  })

  it('retains the standard shell layout for built-in routes', async () => {
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
    renderRoute('/dashboard')

    expect(
      await screen.findByRole('heading', { name: '概览' }),
    ).toBeInTheDocument()
    expect(document.querySelector('main')).toHaveAttribute(
      'data-layout',
      'standard',
    )
  })
})
