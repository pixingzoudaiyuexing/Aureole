import type { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import type { AuthApi } from '@/features/auth/auth-api'
import { referralsApi } from '@/features/referrals/referrals-api'
import { referralsQueryKeys } from '@/features/referrals/referrals-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const overview = {
  codes: [
    { code: 'FIRST123', createdAt: '2026-09-14T01:00:00.000Z' },
    { code: 'SECOND456', createdAt: '2026-09-14T02:00:00.000Z' },
  ],
  stats: {
    registeredUsers: 12,
    earnedCommissionMinor: 12_345,
    pendingCommissionMinor: 678,
    commissionRatePercent: 10,
    availableCommissionMinor: 9_000,
  },
}
const commissionPage = {
  items: [
    {
      orderAmountMinor: 50_000,
      commissionAmountMinor: 5_000,
      createdAt: '2026-09-14T03:00:00.000Z',
    },
    {
      orderAmountMinor: 20_000,
      commissionAmountMinor: 2_000,
      createdAt: '2026-09-14T04:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 20,
  total: 21,
}

function pending<T>() {
  return new Promise<T>(() => undefined)
}

function installMocks() {
  const getOverview = vi
    .spyOn(referralsApi, 'getOverview')
    .mockResolvedValue(overview)
  const getCommissions = vi
    .spyOn(referralsApi, 'getCommissions')
    .mockResolvedValue(commissionPage)
  const getWithdrawalOptions = vi
    .spyOn(referralsApi, 'getWithdrawalOptions')
    .mockResolvedValue({ enabled: true, methods: ['bank_wire', 'wallet-id'] })
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  return { getOverview, getCommissions, getWithdrawalOptions, getConfig }
}

function installClipboard() {
  const writeText = vi.fn(() => Promise.resolve())
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

function renderReferrals(queryClient: QueryClient = createQueryClient()) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'referral-token')
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: null,
      status: 'active',
    }),
  }
  const router = createAppRouter({ initialEntries: ['/referrals'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router }
}

describe('Referrals page', () => {
  it('replaces the placeholder and renders independent loading structure', async () => {
    const mocks = installMocks()
    mocks.getOverview.mockImplementation(() => pending())
    mocks.getCommissions.mockImplementation(() => pending())
    mocks.getWithdrawalOptions.mockImplementation(() => pending())
    renderReferrals()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Referrals' }),
    ).toBeInTheDocument()
    for (const heading of ['推荐概览', '佣金记录', '提现状态']) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
    }
    expect(screen.getByText('正在读取推荐概览…')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.getByText('正在读取佣金记录…')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.getByText('正在读取提现状态…')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByText(/will be added/)).toBeNull()
  })

  it('renders all stats and server order, copies only after an explicit click, and paginates', async () => {
    const mocks = installMocks()
    mocks.getCommissions
      .mockResolvedValueOnce(commissionPage)
      .mockResolvedValueOnce({
        items: [],
        page: 2,
        pageSize: 20,
        total: 21,
      })
    renderReferrals()
    const user = userEvent.setup()
    const writeText = installClipboard()

    const firstCode = await screen.findByText('FIRST123')
    const secondCode = screen.getByText('SECOND456')
    expect(
      firstCode.compareDocumentPosition(secondCode) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(writeText).not.toHaveBeenCalled()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('10%')).toBeInTheDocument()
    for (const money of ['¥123.45 CNY', '¥6.78 CNY', '¥90.00 CNY']) {
      expect(screen.getByText(money)).toBeInTheDocument()
    }

    const firstOrder = screen.getByText('¥500.00 CNY')
    const secondOrder = screen.getByText('¥200.00 CNY')
    expect(
      firstOrder.compareDocumentPosition(secondOrder) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    const firstMethod = screen.getByText('bank_wire')
    const secondMethod = screen.getByText('wallet-id')
    expect(
      firstMethod.compareDocumentPosition(secondMethod) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    await user.click(
      screen.getByRole('button', { name: '复制邀请码 FIRST123' }),
    )
    expect(writeText).toHaveBeenCalledOnce()
    expect(writeText).toHaveBeenCalledWith('FIRST123')
    expect(
      screen.getByRole('button', { name: '已复制 FIRST123' }),
    ).toBeInTheDocument()

    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    const nextPage = screen.getByRole('button', { name: '下一页' })
    nextPage.focus()
    expect(nextPage).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitFor(() =>
      expect(mocks.getCommissions).toHaveBeenCalledWith(
        'referral-token',
        2,
        20,
      ),
    )
    expect(await screen.findByText('第 2 页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('shows honest empty and disabled withdrawal states without mutation controls', async () => {
    const mocks = installMocks()
    mocks.getOverview.mockResolvedValue({ ...overview, codes: [] })
    mocks.getCommissions.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })
    mocks.getWithdrawalOptions.mockResolvedValue({
      enabled: false,
      methods: [],
    })
    renderReferrals()

    expect(await screen.findByText('暂无邀请码。')).toBeInTheDocument()
    expect(screen.getByText('暂无佣金记录。')).toBeInTheDocument()
    expect(screen.getByText('当前暂未开放提现。')).toBeInTheDocument()
    for (const command of [
      '创建邀请码',
      '生成邀请码',
      '佣金划转',
      '转入钱包',
      '申请提现',
      '提交提现',
    ]) {
      expect(screen.queryByRole('button', { name: command })).toBeNull()
    }
  })

  it('shows a recoverable local error when clipboard access fails', async () => {
    installMocks()
    renderReferrals()
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await user.click(
      await screen.findByRole('button', { name: '复制邀请码 FIRST123' }),
    )
    expect(writeText).toHaveBeenCalledWith('FIRST123')
    expect(
      await screen.findByText('无法复制邀请码，请重试或手动复制。'),
    ).toHaveAttribute('role', 'alert')
    expect(
      screen.getByRole('button', { name: '复制邀请码 FIRST123' }),
    ).toBeInTheDocument()
  })

  it('shows the enabled withdrawal empty-method state honestly', async () => {
    const mocks = installMocks()
    mocks.getWithdrawalOptions.mockResolvedValue({ enabled: true, methods: [] })
    renderReferrals()
    expect(await screen.findByText('当前未提供提现方式。')).toBeInTheDocument()
  })

  it.each([
    ['CNY', '¥', 12_345, '¥123.45 CNY'],
    ['JPY', '¥', 12_345, '¥12,345 JPY'],
    ['CNY', '¥', Number.MAX_SAFE_INTEGER, '¥90,071,992,547,409.91 CNY'],
  ] as const)(
    'uses canonical %s formatting for %i minor units',
    async (currency, currencySymbol, amount, expected) => {
      const mocks = installMocks()
      mocks.getConfig.mockResolvedValue({ currency, currencySymbol })
      mocks.getOverview.mockResolvedValue({
        ...overview,
        stats: {
          ...overview.stats,
          earnedCommissionMinor: amount,
          pendingCommissionMinor: amount,
          availableCommissionMinor: amount,
        },
      })
      renderReferrals()
      expect(await screen.findAllByText(expected)).toHaveLength(3)
    },
  )

  it('keeps referral data visible with minor-unit fallback for unsupported currency', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockResolvedValue({ currency: 'ZZZ', currencySymbol: '?' })
    renderReferrals()
    expect(await screen.findByText('FIRST123')).toBeInTheDocument()
    expect(screen.getByText('12,345 最小货币单位')).toBeInTheDocument()
    expect(screen.queryByText(/\?/)).toBeNull()
  })

  it('keeps every referral section visible while Account Config fails and retries it', async () => {
    const mocks = installMocks()
    mocks.getConfig
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockResolvedValueOnce({ currency: 'CNY', currencySymbol: '¥' })
    renderReferrals()
    const user = userEvent.setup()

    expect(await screen.findByText('FIRST123')).toBeInTheDocument()
    expect(screen.getByText('12,345 最小货币单位')).toBeInTheDocument()
    expect(screen.getByText('50,000 最小货币单位')).toBeInTheDocument()
    expect(screen.getByText('bank_wire')).toBeInTheDocument()
    expect(
      await screen.findByText(
        '暂时无法读取结算币种；金额仍以最小货币单位显示。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('¥123.45 CNY')).toBeInTheDocument()
  })

  it.each([
    ['overview', '暂时无法读取推荐概览和邀请码。'],
    ['commissions', '暂时无法读取佣金记录。'],
    ['withdrawal', '暂时无法读取提现状态。'],
  ] as const)(
    'isolates an ordinary %s error and retries only that domain',
    async (source, message) => {
      const mocks = installMocks()
      const method =
        source === 'overview'
          ? mocks.getOverview
          : source === 'commissions'
            ? mocks.getCommissions
            : mocks.getWithdrawalOptions
      const success =
        source === 'overview'
          ? overview
          : source === 'commissions'
            ? commissionPage
            : { enabled: true, methods: ['bank_wire'] }
      method
        .mockRejectedValueOnce(
          new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
        )
        .mockRejectedValueOnce(
          new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
        )
        .mockResolvedValueOnce(success as never)
      renderReferrals()
      const user = userEvent.setup()

      expect(
        await screen.findByText(message, {}, { timeout: 3_000 }),
      ).toBeInTheDocument()
      if (source !== 'overview')
        expect(screen.getByText('FIRST123')).toBeInTheDocument()
      if (source !== 'commissions')
        expect(screen.getByText('¥500.00 CNY')).toBeInTheDocument()
      if (source !== 'withdrawal')
        expect(screen.getByText('bank_wire')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '重试' }))
      await waitFor(() => expect(method).toHaveBeenCalledTimes(3))
    },
  )

  it.each([
    ['overview', 'AUTH_REQUIRED'],
    ['overview', 'AUTH_FAILED'],
    ['commissions', 'AUTH_REQUIRED'],
    ['commissions', 'AUTH_FAILED'],
    ['withdrawal', 'AUTH_REQUIRED'],
    ['withdrawal', 'AUTH_FAILED'],
  ] as const)(
    'exits protected UI and clears Query cache when %s returns %s',
    async (source, code) => {
      const mocks = installMocks()
      const method =
        source === 'overview'
          ? mocks.getOverview
          : source === 'commissions'
            ? mocks.getCommissions
            : mocks.getWithdrawalOptions
      method.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const queryClient = createQueryClient()
      queryClient.setQueryData(['sensitive-server-state'], { private: true })
      const { router } = renderReferrals(queryClient)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(
        queryClient.getQueryData(['sensitive-server-state']),
      ).toBeUndefined()
      expect(
        queryClient.getQueryData(referralsQueryKeys.overview),
      ).toBeUndefined()
    },
  )

  it('keeps every canonical query key free of credentials and private values', async () => {
    installMocks()
    const { queryClient } = renderReferrals()
    await screen.findByText('FIRST123')
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey)
    expect(keys).toContainEqual(referralsQueryKeys.overview)
    expect(keys).toContainEqual(referralsQueryKeys.commissions(1))
    expect(keys).toContainEqual(referralsQueryKeys.withdrawalOptions)
    const serialized = JSON.stringify(keys)
    for (const privateValue of [
      'referral-token',
      'FIRST123',
      'member@example.com',
    ]) {
      expect(serialized).not.toContain(privateValue)
    }
  })
})
