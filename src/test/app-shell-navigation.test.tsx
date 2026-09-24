import type { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import {
  customPagesApi,
  type CustomPage,
} from '@/features/custom-pages/custom-pages-api'
import { noticesApi } from '@/features/notices/notices-api'
import { ordersApi } from '@/features/orders/orders-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const iframePage: CustomPage = {
  id: 'guide',
  title: '使用指南',
  url: 'https://docs.example.com/guide',
  mode: 'iframe',
}

function installNavigationMocks() {
  vi.mocked(customPagesApi.getList).mockResolvedValue({ items: [iframePage] })
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
  vi.spyOn(ordersApi, 'getList').mockResolvedValue([])
  vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
}

function renderRoute(
  path = '/dashboard',
  queryClient: QueryClient = createQueryClient(),
) {
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
      queryClient={queryClient}
    />,
  )
  return { router }
}

async function openMobileNavigation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Open navigation' }),
  )
  const sheet = screen.getByRole('dialog', { name: 'Navigation' })
  await waitFor(() =>
    expect(document.body).toHaveAttribute('data-scroll-locked'),
  )
  return sheet
}

async function expectMobileNavigationClosed() {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull()
    expect(document.querySelector('[data-state="open"]')).toBeNull()
    expect(document.body).not.toHaveAttribute('data-scroll-locked')
  })
}

describe('App shell navigation', () => {
  it.each([
    ['Orders', '/orders'],
    ['使用指南', '/custom/guide'],
  ])(
    'closes the mobile sheet after navigating to %s',
    async (label, expectedPath) => {
      installNavigationMocks()
      const user = userEvent.setup()
      const { router } = renderRoute()
      const sheet = await openMobileNavigation(user)

      await user.click(within(sheet).getByRole('link', { name: label }))

      await waitFor(() =>
        expect(router.state.location.pathname).toBe(expectedPath),
      )
      await expectMobileNavigationClosed()
    },
  )

  it('keeps the mobile manual close behavior', async () => {
    installNavigationMocks()
    const user = userEvent.setup()
    renderRoute()
    const sheet = await openMobileNavigation(user)

    await user.click(
      within(sheet).getByRole('button', { name: 'Close navigation' }),
    )

    await expectMobileNavigationClosed()
  })

  it('keeps the mobile overlay close behavior', async () => {
    installNavigationMocks()
    const user = userEvent.setup()
    renderRoute()
    await openMobileNavigation(user)
    const overlay = document.querySelector<HTMLElement>(
      'div[data-state="open"][class~="inset-0"]',
    )

    expect(overlay).not.toBeNull()
    await user.click(overlay!)

    await expectMobileNavigationClosed()
  })

  it('keeps desktop navigation independent from the mobile sheet', async () => {
    installNavigationMocks()
    const user = userEvent.setup()
    const { router } = renderRoute()
    const desktopNavigation = await screen.findByRole('navigation', {
      name: 'Primary',
    })

    await user.click(
      within(desktopNavigation).getByRole('link', { name: 'Orders' }),
    )

    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'))
    expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull()
    expect(document.body).not.toHaveAttribute('data-scroll-locked')
  })
})
