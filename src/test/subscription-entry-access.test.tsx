import type { QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import {
  subscriptionApi,
  type SubscriptionDeliveryOptions,
} from '@/features/subscription/subscription-api'
import { subscriptionImportNavigation } from '@/features/subscription/subscription-imports'
import { SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY } from '@/features/subscription/subscription-selection-storage'
import { trafficApi } from '@/features/traffic/traffic-api'
import { ApiError } from '@/lib/api/errors'
import { useAuthSessionStore } from '@/lib/auth/session-store'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="subscription-qr" data-value={value} />
  ),
}))

const entries = [
  { id: 'primary', label: 'Primary Subscription' },
  { id: 'backup', label: 'Backup Subscription' },
  { id: 'regional', label: 'Regional Subscription' },
]
const accessUrls = {
  primary: 'https://subscription.example/PRIMARY_TOKEN',
  backup: 'https://subscription.example/BACKUP_TOKEN',
  regional: 'https://subscription.example/REGIONAL_TOKEN',
}
const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}
const overview = {
  product: { id: '7', name: 'Pro Plan' },
  expiresAt: '2030-01-01T00:00:00.000Z',
  traffic: { uploadedBytes: 1, downloadedBytes: 2, allowanceBytes: 3 },
  deviceLimit: 3,
  activeDevices: 1,
  resetDay: 15,
  renewalAllowed: true,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function installMocks(
  delivery: SubscriptionDeliveryOptions = {
    defaultEntryId: 'primary',
    entries,
  },
) {
  const getDeliveryOptions = vi
    .spyOn(subscriptionApi, 'getDeliveryOptions')
    .mockResolvedValue(delivery)
  const getAccessLink = vi
    .spyOn(subscriptionApi, 'getAccessLink')
    .mockImplementation(async (_token, input) => ({
      accessUrl: accessUrls[input.entryId as keyof typeof accessUrls],
    }))
  vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue(overview)
  vi.spyOn(subscriptionApi, 'rotateAccess').mockResolvedValue({
    rotated: true,
    accessUrl: 'https://legacy.example/LEGACY_TOKEN',
  })
  vi.spyOn(subscriptionApi, 'advancePeriod').mockResolvedValue({
    advanced: true,
  })
  vi.spyOn(trafficApi, 'getLogs').mockResolvedValue([])
  return { getAccessLink, getDeliveryOptions }
}

function renderSubscription(
  queryClient: QueryClient = createQueryClient(),
  authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
  },
) {
  const router = createAppRouter({ initialEntries: ['/subscription'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router }
}

function installClipboard() {
  const writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

describe('Subscription delivery selection and credential runtime', () => {
  it('uses the declared default and preserves server order and labels', async () => {
    const mocks = installMocks({
      defaultEntryId: 'backup',
      entries: [entries[2]!, entries[1]!, entries[0]!],
    })
    renderSubscription()

    const selector = await screen.findByRole('combobox', { name: '订阅入口' })
    expect(selector).toHaveValue('backup')
    expect(
      Array.from((selector as HTMLSelectElement).options).map((option) => [
        option.value,
        option.textContent,
      ]),
    ).toEqual([
      ['regional', 'Regional Subscription'],
      ['backup', 'Backup Subscription'],
      ['primary', 'Primary Subscription'],
    ])
    expect(mocks.getAccessLink).toHaveBeenCalledWith(
      expect.any(String),
      {
        entryId: 'backup',
        profileId: 'default',
        subscriptionInfo: 'show',
      },
      expect.any(AbortSignal),
    )
    expect(
      window.sessionStorage.getItem(SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY),
    ).toBe('backup')
  })

  it('does not invent the first entry when defaultEntryId is null', async () => {
    const mocks = installMocks({ defaultEntryId: null, entries })
    renderSubscription()

    expect(await screen.findByText('请选择订阅入口。')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Primary Subscription' }),
    ).toBeInTheDocument()
    expect(mocks.getAccessLink).not.toHaveBeenCalled()
    expect(
      window.sessionStorage.getItem(SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY),
    ).toBeNull()
  })

  it('clears a historical baseUrl without guessing an entryId', async () => {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      'https://legacy.example/subscriptions',
    )
    installMocks({ defaultEntryId: null, entries })
    renderSubscription()

    expect(await screen.findByText('请选择订阅入口。')).toBeInTheDocument()
    expect(
      window.sessionStorage.getItem(SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY),
    ).toBeNull()
  })

  it('restores only a current stable persisted entryId', async () => {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      'regional',
    )
    const mocks = installMocks()
    renderSubscription()

    expect(
      await screen.findByRole('combobox', { name: '订阅入口' }),
    ).toHaveValue('regional')
    expect(mocks.getAccessLink).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ entryId: 'regional' }),
      expect.any(AbortSignal),
    )
  })

  it('clears a stale stable entryId and uses the authoritative default', async () => {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      'removed-entry',
    )
    const mocks = installMocks({ defaultEntryId: 'backup', entries })
    renderSubscription()

    expect(
      await screen.findByRole('combobox', { name: '订阅入口' }),
    ).toHaveValue('backup')
    expect(
      window.sessionStorage.getItem(SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY),
    ).toBe('backup')
    expect(mocks.getAccessLink).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ entryId: 'backup' }),
      expect.any(AbortSignal),
    )
  })

  it('accepts empty options as a controlled unavailable state', async () => {
    const mocks = installMocks({ defaultEntryId: null, entries: [] })
    renderSubscription()

    expect(await screen.findByText('暂无可用订阅入口')).toBeInTheDocument()
    expect(mocks.getAccessLink).not.toHaveBeenCalled()
  })

  it('keeps accessUrl out of Query cache and durable storage', async () => {
    installMocks()
    const { queryClient, router } = renderSubscription()

    expect(await screen.findByText(accessUrls.primary)).toBeInTheDocument()
    const serializedQueryData = JSON.stringify(
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    )
    expect(serializedQueryData).not.toContain(accessUrls.primary)
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(
      accessUrls.primary,
    )
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(
      accessUrls.primary,
    )
    expect(router.state.location.search).toEqual({})
  })

  it('suppresses A immediately and ignores its late result after selecting B', async () => {
    const pendingA = deferred<{ accessUrl: string }>()
    const mocks = installMocks()
    mocks.getAccessLink.mockImplementation((_token, input) =>
      input.entryId === 'primary'
        ? pendingA.promise
        : Promise.resolve({ accessUrl: accessUrls.backup }),
    )
    renderSubscription()
    const user = userEvent.setup()

    const selector = await screen.findByRole('combobox', { name: '订阅入口' })
    await user.selectOptions(selector, 'backup')
    expect(await screen.findByText(accessUrls.backup)).toBeInTheDocument()

    act(() => pendingA.resolve({ accessUrl: accessUrls.primary }))
    await waitFor(() =>
      expect(screen.getByText(accessUrls.backup)).toBeInTheDocument(),
    )
    expect(screen.queryByText(accessUrls.primary)).toBeNull()
  })

  it('removes a visible A credential immediately while B is pending', async () => {
    const pendingB = deferred<{ accessUrl: string }>()
    const mocks = installMocks()
    mocks.getAccessLink.mockImplementation((_token, input) =>
      input.entryId === 'backup'
        ? pendingB.promise
        : Promise.resolve({ accessUrl: accessUrls.primary }),
    )
    renderSubscription()
    const user = userEvent.setup()

    expect(await screen.findByText(accessUrls.primary)).toBeInTheDocument()

    await user.selectOptions(
      screen.getByRole('combobox', { name: '订阅入口' }),
      'backup',
    )
    expect(screen.queryByText(accessUrls.primary)).toBeNull()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    expect(screen.queryByRole('button', { name: '显示二维码' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clash' })).toBeNull()
    expect(screen.getByText('正在读取订阅地址…')).toBeInTheDocument()

    act(() => pendingB.resolve({ accessUrl: accessUrls.backup }))
    expect(await screen.findByText(accessUrls.backup)).toBeInTheDocument()
  })

  it('always requests show and exposes no subscription info mode controls', async () => {
    const mocks = installMocks()
    renderSubscription()
    expect(await screen.findByText(accessUrls.primary)).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '订阅信息' })).toBeNull()
    expect(screen.queryByRole('button', { name: '显示订阅信息' })).toBeNull()
    expect(screen.queryByRole('button', { name: '隐藏订阅信息' })).toBeNull()
    expect(mocks.getAccessLink).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ subscriptionInfo: 'show' }),
      expect.any(AbortSignal),
    )
    expect(
      mocks.getAccessLink.mock.calls.every(
        ([, input]) => input.subscriptionInfo === 'show',
      ),
    ).toBe(true)
  })

  it('clears a failed credential and retries without restoring the old URL', async () => {
    const mocks = installMocks()
    mocks.getAccessLink
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'private' }),
      )
      .mockResolvedValueOnce({ accessUrl: accessUrls.primary })
    renderSubscription()
    const user = userEvent.setup()

    expect(
      await screen.findByText('暂时无法读取订阅地址。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    expect(screen.queryByText(accessUrls.primary)).toBeNull()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText(accessUrls.primary)).toBeInTheDocument()
  })

  it('fails closed when access is unavailable', async () => {
    const mocks = installMocks()
    mocks.getAccessLink.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'SUBSCRIPTION_ACCESS_UNAVAILABLE',
        message: 'private unavailable detail',
      }),
    )
    renderSubscription()

    expect(
      await screen.findByText('当前没有可展示的订阅地址。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    expect(screen.queryByRole('button', { name: '显示二维码' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clash' })).toBeNull()
    expect(screen.queryByText('private unavailable detail')).toBeNull()
  })

  it('reconciles a 422 by refreshing options and requiring explicit selection', async () => {
    const mocks = installMocks()
    mocks.getDeliveryOptions
      .mockResolvedValueOnce({ defaultEntryId: 'primary', entries })
      .mockResolvedValue({ defaultEntryId: 'backup', entries: [entries[1]!] })
    mocks.getAccessLink.mockRejectedValueOnce(
      new ApiError({
        status: 422,
        code: 'SUBSCRIPTION_ENTRY_UNAVAILABLE',
        message: 'private',
      }),
    )
    renderSubscription()

    expect(
      await screen.findByText('原订阅入口已不可用，请重新选择'),
    ).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Backup Subscription' }),
    ).toBeInTheDocument()
    expect(mocks.getDeliveryOptions).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
  })

  it('keeps copy, QR and imports bound to the current exact URL', async () => {
    installMocks()
    const navigation = vi
      .spyOn(subscriptionImportNavigation, 'goTo')
      .mockImplementation(() => undefined)
    renderSubscription()
    const user = userEvent.setup()
    const writeText = installClipboard()
    expect(await screen.findByText(accessUrls.primary)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '复制' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(accessUrls.primary),
    )
    await user.click(screen.getByRole('button', { name: '显示二维码' }))
    expect(screen.getByTestId('subscription-qr')).toHaveAttribute(
      'data-value',
      accessUrls.primary,
    )
    await user.click(screen.getByRole('button', { name: 'Clash' }))
    expect(navigation).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(accessUrls.primary)),
    )
  })

  it('never renders a delayed Session A credential after Session B becomes active', async () => {
    const pendingA = deferred<{ accessUrl: string }>()
    const mocks = installMocks()
    let current: 'a' | 'b' | null = 'a'
    let firstIdentity: string | null = null
    mocks.getAccessLink.mockImplementation((token) => {
      if (firstIdentity === null) firstIdentity = token
      return token === firstIdentity
        ? pendingA.promise
        : Promise.resolve({ accessUrl: accessUrls.backup })
    })
    const authApi: AuthApi = {
      login: vi.fn().mockImplementation(async () => {
        current = 'b'
        return {
          ...currentUser,
          email: 'b@example.com',
          sessionVersion: 'session-b',
        }
      }),
      logout: vi.fn().mockImplementation(async () => {
        current = null
      }),
      getCurrentUser: vi.fn().mockImplementation(async () => {
        if (!current)
          throw new ApiError({
            status: 401,
            code: 'AUTH_REQUIRED',
            message: 'Authentication required',
          })
        return {
          ...currentUser,
          email: `${current}@example.com`,
          sessionVersion: `session-${current}`,
        }
      }),
    }
    const { router } = renderSubscription(createQueryClient(), authApi)
    const user = userEvent.setup()
    await waitFor(() => expect(mocks.getAccessLink).toHaveBeenCalled())

    const logout = screen.getAllByRole('button', { name: '退出登录' })[0]!
    await user.click(logout)
    await user.type(await screen.findByLabelText('邮箱'), 'b@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/dashboard'),
    )
    await act(async () => router.navigate({ to: '/subscription' }))
    expect(await screen.findByText(accessUrls.backup)).toBeInTheDocument()

    act(() => pendingA.resolve({ accessUrl: accessUrls.primary }))
    await waitFor(() =>
      expect(useAuthSessionStore.getState().sessionVersion).toBe('session-b'),
    )
    expect(useAuthSessionStore.getState().accessToken).not.toBe(firstIdentity)
    expect(screen.queryByText(accessUrls.primary)).toBeNull()
  })
})
