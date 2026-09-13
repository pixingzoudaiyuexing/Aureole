import type { QueryClient } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import type { AuthApi } from '@/features/auth/auth-api'
import { walletApi } from '@/features/wallet/wallet-api'
import { walletQueryKeys } from '@/features/wallet/wallet-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

function pending<T>() {
  return new Promise<T>(() => undefined)
}

function installMocks() {
  const getWallet = vi
    .spyOn(walletApi, 'getWallet')
    .mockResolvedValue({ balanceMinor: 12_345 })
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  return { getConfig, getWallet }
}

function renderWallet(queryClient: QueryClient = createQueryClient()) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'wallet-token')
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: null,
      status: 'active',
    }),
  }
  const router = createAppRouter({ initialEntries: ['/wallet'] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router }
}

describe('Wallet page', () => {
  it('preserves layout while the wallet is loading', async () => {
    const mocks = installMocks()
    mocks.getWallet.mockImplementation(() => pending())
    renderWallet()

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Wallet' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '当前余额' }),
    ).toBeInTheDocument()
    expect(screen.getByText('正在读取余额…')).toHaveAttribute('role', 'status')
  })

  it.each([
    [0, '¥0.00 CNY'],
    [1, '¥0.01 CNY'],
    [12_345, '¥123.45 CNY'],
    [2_147_483_647, '¥21,474,836.47 CNY'],
  ] as const)(
    'shows balanceMinor=%i with canonical CNY formatting',
    async (balanceMinor, expected) => {
      const mocks = installMocks()
      mocks.getWallet.mockResolvedValue({ balanceMinor })
      renderWallet()

      expect(await screen.findByText(expected)).toBeInTheDocument()
      expect(screen.getByLabelText(`当前余额：${expected}`)).toBeInTheDocument()
    },
  )

  it('uses canonical JPY minor units without a /100 assumption', async () => {
    const mocks = installMocks()
    mocks.getWallet.mockResolvedValue({ balanceMinor: 12_345 })
    mocks.getConfig.mockResolvedValue({ currency: 'JPY', currencySymbol: '¥' })
    renderWallet()

    expect(await screen.findByText('¥12,345 JPY')).toBeInTheDocument()
    expect(screen.queryByText('¥123.45 JPY')).toBeNull()
  })

  it('does not guess a currency while Account Config is loading', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockImplementation(() => pending())
    renderWallet()

    expect(await screen.findByText('正在读取币种…')).toHaveAttribute(
      'role',
      'status',
    )
    expect(screen.queryByText(/¥|CNY|USD/)).toBeNull()
  })

  it('fails formatting closed and retries Account Config independently', async () => {
    const mocks = installMocks()
    mocks.getConfig
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'Invalid response',
        }),
      )
      .mockResolvedValueOnce({ currency: 'CNY', currencySymbol: '¥' })
    renderWallet()
    const user = userEvent.setup()

    expect(
      await screen.findByText('暂时无法读取结算币种，余额无法安全格式化。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('12345')).toBeNull()
    await user.click(screen.getAllByRole('button', { name: '重试' })[0]!)
    expect(await screen.findByText('¥123.45 CNY')).toBeInTheDocument()
    expect(mocks.getWallet).toHaveBeenCalledOnce()
  })

  it('shows an ordinary wallet error and retries without exiting the session', async () => {
    const mocks = installMocks()
    mocks.getWallet
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'UPSTREAM_ERROR',
          message: 'Unavailable',
          requestId: 'req-wallet',
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'UPSTREAM_ERROR',
          message: 'Unavailable',
          requestId: 'req-wallet',
        }),
      )
      .mockResolvedValueOnce({ balanceMinor: 12_345 })
    renderWallet()
    const user = userEvent.setup()

    expect(
      await screen.findByText('暂时无法读取站内余额。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('请求编号：req-wallet')).toBeInTheDocument()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'wallet-token',
    )
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('¥123.45 CNY')).toBeInTheDocument()
  })

  it.each([
    ['wallet', 'AUTH_REQUIRED'],
    ['wallet', 'AUTH_FAILED'],
    ['config', 'AUTH_REQUIRED'],
    ['config', 'AUTH_FAILED'],
  ] as const)(
    'exits protected UI and clears Query cache when %s returns %s',
    async (source, code) => {
      const mocks = installMocks()
      mocks[source === 'wallet' ? 'getWallet' : 'getConfig'].mockRejectedValue(
        new ApiError({ status: 401, code, message: 'Authentication failed' }),
      )
      const queryClient = createQueryClient()
      queryClient.setQueryData(['sensitive-server-state'], { private: true })
      const { router } = renderWallet(queryClient)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(
        queryClient.getQueryData(['sensitive-server-state']),
      ).toBeUndefined()
      expect(queryClient.getQueryData(walletQueryKeys.wallet)).toBeUndefined()
    },
  )

  it('contains deposit and Gift Card but no fake transaction UI', async () => {
    installMocks()
    renderWallet()

    expect(await screen.findByText('¥123.45 CNY')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '充值余额' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '创建充值订单' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '兑换礼品卡' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '兑换礼品卡' }),
    ).toBeInTheDocument()
    for (const text of [
      '交易流水',
      '交易记录',
      '充值记录',
      '佣金',
      '待入账余额',
    ]) {
      expect(screen.queryByText(text)).toBeNull()
      expect(screen.queryByRole('button', { name: text })).toBeNull()
    }
  })

  it('keeps the canonical Wallet query key credential-free', async () => {
    installMocks()
    const { queryClient } = renderWallet()
    await screen.findByText('¥123.45 CNY')

    expect(walletQueryKeys.wallet).toEqual(['wallet'])
    expect(
      queryClient.getQueryCache().find({ queryKey: walletQueryKeys.wallet }),
    ).toBeDefined()
    expect(JSON.stringify(walletQueryKeys.wallet)).not.toContain('wallet-token')
  })
})
