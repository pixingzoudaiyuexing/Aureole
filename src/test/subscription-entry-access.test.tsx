import { QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import {
  buildSubscriptionImportUri,
  subscriptionImportNavigation,
} from '@/features/subscription/subscription-imports'
import { SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY } from '@/features/subscription/subscription-selection-storage'
import { trafficApi } from '@/features/traffic/traffic-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => (
    <svg data-testid="subscription-qr" data-value={value} />
  ),
}))

const entryA = 'https://a.example.com'
const entryB = 'https://same.example.com/b'
const entryC = 'https://same.example.com/c'
const accessA = `${entryA}/api/v1/client/subscribe?token=dummy-a`
const accessB = `${entryB}/api/v1/client/subscribe?token=dummy-b`
const accessC = `${entryC}/api/v1/client/subscribe?token=dummy-c`

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const overview = {
  product: { id: '7', name: 'Pro Plan' },
  expiresAt: '2030-01-01T00:00:00.000Z',
  traffic: {
    uploadedBytes: 1,
    downloadedBytes: 2,
    allowanceBytes: 3,
  },
  deviceLimit: 3,
  activeDevices: 1,
  resetDay: 15,
  renewalAllowed: true,
}

function installPageMocks(entries = [entryA]) {
  const getEntries = vi.spyOn(subscriptionApi, 'getEntries').mockResolvedValue({
    entries: entries.map((baseUrl) => ({ baseUrl })),
  })
  const getEntryAccess = vi
    .spyOn(subscriptionApi, 'getEntryAccess')
    .mockImplementation(async (_token, baseUrl) => ({
      accessUrl:
        baseUrl === entryA ? accessA : baseUrl === entryB ? accessB : accessC,
    }))
  vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue(overview)
  vi.spyOn(subscriptionApi, 'rotateAccess').mockResolvedValue({
    rotated: true,
    accessUrl:
      'https://legacy.example/api/v1/access/subscription?token=legacy-only',
  })
  vi.spyOn(subscriptionApi, 'advancePeriod').mockResolvedValue({
    advanced: true,
  })
  vi.spyOn(trafficApi, 'getLogs').mockResolvedValue([])
  return { getEntries, getEntryAccess }
}

function renderSubscription(
  queryClient: QueryClient = createQueryClient(),
  strictMode = false,
) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'opaque-token')
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(currentUser),
  }
  const router = createAppRouter({ initialEntries: ['/subscription'] })
  const app = (
    <AppProviders router={router} authApi={authApi} queryClient={queryClient} />
  )
  render(strictMode ? <StrictMode>{app}</StrictMode> : app)
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

function installClipboard() {
  const writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

beforeEach(() => {
  document.title = 'Aureole Test'
})

describe('Multiple subscription entry selection', () => {
  it('renders zero entries without requesting or exposing credential actions', async () => {
    const mocks = installPageMocks([])
    renderSubscription()

    expect(await screen.findByText('暂无可用订阅入口')).toBeInTheDocument()
    expect(mocks.getEntryAccess).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    expect(screen.queryByRole('button', { name: '显示二维码' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clash' })).toBeNull()
  })

  it('loads selected access under React StrictMode without removing the current query', async () => {
    installPageMocks([entryA, entryB])
    renderSubscription(createQueryClient(), true)

    expect(await screen.findByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '订阅入口' })).toHaveValue(
      entryA,
    )
  })

  it('uses the first entry by default and preserves server order for multiple entries', async () => {
    const mocks = installPageMocks([entryB, entryA, entryC])
    renderSubscription()

    const selector = await screen.findByRole('combobox', {
      name: '订阅入口',
    })
    expect(selector).toHaveValue(entryB)
    expect(
      Array.from((selector as HTMLSelectElement).options).map(
        (option) => option.value,
      ),
    ).toEqual([entryB, entryA, entryC])
    expect(mocks.getEntryAccess).toHaveBeenCalledWith(
      'opaque-token',
      entryB,
      expect.any(AbortSignal),
    )
    expect(
      window.sessionStorage.getItem(SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY),
    ).toBe(entryB)
  })

  it('restores a valid persisted selection and requires explicit choice for a stale one', async () => {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      entryB,
    )
    const mocks = installPageMocks([entryA, entryC])
    renderSubscription()

    expect(
      await screen.findByText('原订阅入口已不可用，请重新选择'),
    ).toBeInTheDocument()
    expect(mocks.getEntryAccess).not.toHaveBeenCalled()
    expect(
      window.sessionStorage.getItem(SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY),
    ).toBeNull()

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '使用入口 2' }))
    expect(await screen.findByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    expect(mocks.getEntryAccess).toHaveBeenCalledWith(
      'opaque-token',
      entryC,
      expect.any(AbortSignal),
    )
  })

  it('restores an existing valid selection on refresh', async () => {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      entryC,
    )
    const mocks = installPageMocks([entryA, entryB, entryC])
    renderSubscription()

    expect(
      await screen.findByRole('combobox', { name: '订阅入口' }),
    ).toHaveValue(entryC)
    expect(mocks.getEntryAccess).toHaveBeenCalledWith(
      'opaque-token',
      entryC,
      expect.any(AbortSignal),
    )
  })

  it('hides A actions immediately while B is pending', async () => {
    const mocks = installPageMocks([entryA, entryB])
    const pendingB = createDeferred<{ accessUrl: string }>()
    mocks.getEntryAccess.mockImplementation(async (_token, baseUrl) => {
      if (baseUrl === entryB) return pendingB.promise
      return { accessUrl: accessA }
    })
    const { queryClient } = renderSubscription()
    const user = userEvent.setup()
    installClipboard()

    await screen.findByLabelText('订阅地址已隐藏')
    await user.click(screen.getByRole('button', { name: '显示' }))
    await user.click(screen.getByRole('button', { name: '复制' }))
    await user.click(screen.getByRole('button', { name: '显示二维码' }))
    expect(screen.getByTestId('subscription-qr')).toHaveAttribute(
      'data-value',
      accessA,
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: '订阅入口' }),
      entryB,
    )

    expect(screen.queryByText(accessA)).toBeNull()
    expect(screen.queryByTestId('subscription-qr')).toBeNull()
    expect(screen.queryByText('已复制')).toBeNull()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    expect(screen.queryByRole('button', { name: '显示二维码' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clash' })).toBeNull()
    expect(screen.getByText('正在读取订阅地址…')).toBeInTheDocument()

    act(() => pendingB.resolve({ accessUrl: accessB }))
    expect(await screen.findByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    await waitFor(() =>
      expect(
        JSON.stringify(
          queryClient
            .getQueryCache()
            .getAll()
            .map((query) => query.state.data),
        ),
      ).not.toContain(accessA),
    )
  })

  it('keeps C authoritative when B resolves after a rapid A to B to C switch', async () => {
    const mocks = installPageMocks([entryA, entryB, entryC])
    const pendingB = createDeferred<{ accessUrl: string }>()
    const pendingC = createDeferred<{ accessUrl: string }>()
    mocks.getEntryAccess.mockImplementation(async (_token, baseUrl) => {
      if (baseUrl === entryB) return pendingB.promise
      if (baseUrl === entryC) return pendingC.promise
      return { accessUrl: accessA }
    })
    renderSubscription()
    const user = userEvent.setup()
    const selector = await screen.findByRole('combobox', {
      name: '订阅入口',
    })

    await user.selectOptions(selector, entryB)
    await user.selectOptions(selector, entryC)
    act(() => pendingC.resolve({ accessUrl: accessC }))
    await user.click(await screen.findByRole('button', { name: '显示' }))
    expect(screen.getByText(accessC)).toBeInTheDocument()

    act(() => pendingB.resolve({ accessUrl: accessB }))
    await waitFor(() => expect(screen.getByText(accessC)).toBeInTheDocument())
    expect(screen.queryByText(accessB)).toBeNull()
  })

  it('uses one selected access URL for display, copy, QR and all client imports', async () => {
    installPageMocks([entryA, entryB])
    const navigation = vi
      .spyOn(subscriptionImportNavigation, 'goTo')
      .mockImplementation(() => undefined)
    renderSubscription()
    const user = userEvent.setup()
    const writeText = installClipboard()

    await user.selectOptions(
      await screen.findByRole('combobox', { name: '订阅入口' }),
      entryB,
    )
    await screen.findByLabelText('订阅地址已隐藏')
    await user.click(screen.getByRole('button', { name: '显示' }))
    expect(screen.getByText(accessB)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制' }))
    expect(writeText).toHaveBeenCalledWith(accessB)
    await user.click(screen.getByRole('button', { name: '显示二维码' }))
    expect(screen.getByTestId('subscription-qr')).toHaveAttribute(
      'data-value',
      accessB,
    )

    for (const [label, client] of [
      ['Clash', 'clash'],
      ['Shadowrocket', 'shadowrocket'],
      ['Quantumult X', 'quantumult-x'],
      ['SingBox', 'sing-box'],
    ] as const) {
      await user.click(screen.getByRole('button', { name: label }))
      expect(navigation).toHaveBeenLastCalledWith(
        buildSubscriptionImportUri(client, accessB, 'Aureole Test'),
      )
    }

    const durableState = JSON.stringify({
      local: { ...window.localStorage },
      session: { ...window.sessionStorage },
    })
    expect(durableState).not.toContain(accessB)
    expect(durableState).not.toContain('clash://')
    expect(durableState).not.toContain('shadowrocket://')
    expect(durableState).not.toContain('quantumult-x://')
    expect(durableState).not.toContain('sing-box://')
  })

  it('refreshes entries after 422 and does not silently select another entry', async () => {
    window.sessionStorage.setItem(
      SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY,
      entryB,
    )
    const mocks = installPageMocks([entryA, entryB, entryC])
    mocks.getEntries
      .mockResolvedValueOnce({
        entries: [entryA, entryB, entryC].map((baseUrl) => ({ baseUrl })),
      })
      .mockResolvedValueOnce({
        entries: [entryA, entryC].map((baseUrl) => ({ baseUrl })),
      })
    mocks.getEntryAccess.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'SUBSCRIPTION_ENTRY_UNAVAILABLE',
        message: 'private stale detail',
      }),
    )
    renderSubscription()

    expect(
      await screen.findByText('原订阅入口已不可用，请重新选择'),
    ).toBeInTheDocument()
    await waitFor(() => expect(mocks.getEntries).toHaveBeenCalledTimes(2))
    expect(mocks.getEntryAccess).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    expect(screen.queryByText('private stale detail')).toBeNull()
    expect(
      screen.getByRole('button', { name: '使用入口 1' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '使用入口 2' }),
    ).toBeInTheDocument()
  })

  it.each([
    [0, 'NETWORK_ERROR'],
    [502, 'UPSTREAM_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
    [200, 'MALFORMED_RESPONSE'],
  ])(
    'does not automatically retry entry-access after %s/%s',
    async (status, code) => {
      const mocks = installPageMocks([entryA])
      mocks.getEntryAccess.mockRejectedValue(
        new ApiError({ status, code, message: 'private failure' }),
      )
      renderSubscription()

      expect(
        await screen.findByText('暂时无法读取订阅地址。'),
      ).toBeInTheDocument()
      expect(mocks.getEntryAccess).toHaveBeenCalledOnce()
      expect(screen.queryByText('private failure')).toBeNull()
      expect(screen.queryByRole('button', { name: '复制' })).toBeNull()
    },
  )

  it.each([
    [0, 'NETWORK_ERROR'],
    [500, 'UPSTREAM_ERROR'],
    [502, 'UPSTREAM_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
    [200, 'MALFORMED_RESPONSE'],
  ])(
    'shows a safe recoverable entries error after %s/%s',
    async (status, code) => {
      const mocks = installPageMocks([entryA])
      mocks.getEntries.mockRejectedValue(
        new ApiError({
          status,
          code,
          message: 'private entries failure',
          requestId: 'req-entries',
        }),
      )
      renderSubscription()

      expect(
        await screen.findByText('暂时无法读取订阅入口。', undefined, {
          timeout: 3_000,
        }),
      ).toBeInTheDocument()
      expect(screen.getByText('请求编号：req-entries')).toBeInTheDocument()
      expect(screen.queryByText('private entries failure')).toBeNull()
      expect(mocks.getEntryAccess).not.toHaveBeenCalled()
    },
  )

  it('keeps working when selected-entry sessionStorage access fails', async () => {
    installPageMocks([entryA])
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'opaque-token')
    const originalGetItem = Storage.prototype.getItem
    const originalSetItem = Storage.prototype.setItem
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(function (this: Storage, key) {
        if (key === SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY) {
          throw new Error('blocked')
        }
        return originalGetItem.call(this, key)
      })
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (key === SUBSCRIPTION_SELECTED_ENTRY_STORAGE_KEY) {
          throw new Error('blocked')
        }
        return originalSetItem.call(this, key, value)
      })

    try {
      renderSubscription()
      expect(await screen.findByLabelText('订阅地址已隐藏')).toBeInTheDocument()
    } finally {
      getItem.mockRestore()
      setItem.mockRestore()
    }
  })
})
