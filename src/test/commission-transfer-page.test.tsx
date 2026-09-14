import type { QueryClient } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { accountApi } from '@/features/account/account-api'
import { accountQueryKeys } from '@/features/account/account-queries'
import type { AuthApi } from '@/features/auth/auth-api'
import { commissionTransferLocalGuardKeys } from '@/features/referrals/commission-transfer-guard'
import { referralsApi } from '@/features/referrals/referrals-api'
import { referralsQueryKeys } from '@/features/referrals/referrals-queries'
import { walletApi } from '@/features/wallet/wallet-api'
import { walletQueryKeys } from '@/features/wallet/wallet-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const overview = {
  codes: [{ code: 'CODE1', createdAt: '2026-09-14T01:00:00.000Z' }],
  stats: {
    registeredUsers: 12,
    earnedCommissionMinor: 12_345,
    pendingCommissionMinor: 678,
    commissionRatePercent: 10,
    availableCommissionMinor: 10_000,
  },
}
const wallet = { balanceMinor: 5_000 }
const config = { currency: 'CNY', currencySymbol: '¥' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function apiError(code: string, status = 502) {
  return new ApiError({ status, code, message: 'private upstream detail' })
}

function installMocks() {
  const getOverview = vi
    .spyOn(referralsApi, 'getOverview')
    .mockResolvedValue(overview)
  const transferCommission = vi
    .spyOn(referralsApi, 'transferCommission')
    .mockResolvedValue({ transferred: true })
  const getCommissions = vi
    .spyOn(referralsApi, 'getCommissions')
    .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 })
  const getWithdrawalOptions = vi
    .spyOn(referralsApi, 'getWithdrawalOptions')
    .mockResolvedValue({ enabled: false, methods: [] })
  const getWallet = vi.spyOn(walletApi, 'getWallet').mockResolvedValue(wallet)
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue(config)
  return {
    getCommissions,
    getConfig,
    getOverview,
    getWallet,
    getWithdrawalOptions,
    transferCommission,
  }
}

function renderReferrals(queryClient: QueryClient = createQueryClient()) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'transfer-token')
  useAuthSessionStore.setState({
    accessToken: 'transfer-token',
    hydrated: true,
  })
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: null,
      status: 'active',
    }),
  }
  const router = createAppRouter({ initialEntries: ['/referrals'] })
  const rendered = render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router, unmount: rendered.unmount }
}

async function transferSection() {
  const section = (
    await screen.findByRole('heading', { name: '佣金划转' })
  ).closest('section')
  if (!section) throw new Error('Transfer section missing')
  return within(section)
}

async function openConfirmation(amount = '10', user = userEvent.setup()) {
  const section = await transferSection()
  const input = await section.findByRole('textbox', { name: '划转金额' })
  await waitFor(() => expect(input).toBeEnabled())
  await user.clear(input)
  await user.type(input, amount)
  await user.click(section.getByRole('button', { name: '佣金划转' }))
  return { dialog: screen.getByRole('dialog'), input, user }
}

async function confirmTransfer(
  form: Awaited<ReturnType<typeof openConfirmation>>,
) {
  await form.user.click(
    within(form.dialog).getByRole('button', { name: '确认划转' }),
  )
}

describe('Commission Transfer authority and confirmation', () => {
  it('shows current financial values and requires explicit confirmation', async () => {
    const mocks = installMocks()
    renderReferrals()
    const form = await openConfirmation('10.5')

    expect(mocks.transferCommission).not.toHaveBeenCalled()
    expect(within(form.dialog).getByText('¥10.50 CNY')).toBeInTheDocument()
    expect(within(form.dialog).getByText('¥100.00 CNY')).toBeInTheDocument()
    expect(within(form.dialog).getByText('¥50.00 CNY')).toBeInTheDocument()
    expect(
      within(form.dialog).getByText(
        '将提交真实佣金划转操作。请确认金额，避免重复提交。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/划转后/)).toBeNull()

    await form.user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      (await transferSection()).getByRole('button', { name: '佣金划转' }),
    ).toHaveFocus()
    expect(mocks.transferCommission).not.toHaveBeenCalled()
  })

  it.each(['0', '100.01', '1.001', '-1', '1e2', 'abc'])(
    'rejects invalid or unavailable CNY amount %j before POST',
    async (amount) => {
      const mocks = installMocks()
      renderReferrals()
      const section = await transferSection()
      const input = await section.findByRole('textbox', { name: '划转金额' })
      await waitFor(() => expect(input).toBeEnabled())
      await userEvent.setup().type(input, amount)
      await userEvent
        .setup()
        .click(section.getByRole('button', { name: '佣金划转' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(mocks.transferCommission).not.toHaveBeenCalled()
    },
  )

  it('uses JPY zero-fraction semantics without a two-decimal assumption', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockResolvedValue({ currency: 'JPY', currencySymbol: '¥' })
    renderReferrals()
    const form = await openConfirmation('10')
    expect(within(form.dialog).getByText('¥10 JPY')).toBeInTheDocument()
    await form.user.click(
      within(form.dialog).getByRole('button', { name: '取消' }),
    )
    const input = (await transferSection()).getByRole('textbox', {
      name: '划转金额',
    })
    await form.user.clear(input)
    await form.user.type(input, '1.0')
    await form.user.click(
      (await transferSection()).getByRole('button', { name: '佣金划转' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.transferCommission).not.toHaveBeenCalled()
  })

  it('allows an explicit INT_MAX transfer when available commission is larger', async () => {
    const mocks = installMocks()
    mocks.getOverview.mockResolvedValue({
      ...overview,
      stats: {
        ...overview.stats,
        availableCommissionMinor: Number.MAX_SAFE_INTEGER,
      },
    })
    renderReferrals()
    const form = await openConfirmation('21474836.47')
    expect(
      within(form.dialog).getByText('¥21,474,836.47 CNY'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /全部/ })).toBeNull()
    await confirmTransfer(form)
    expect(mocks.transferCommission).toHaveBeenCalledWith('transfer-token', {
      amountMinor: 2_147_483_647,
    })
  })

  it.each(['overview', 'wallet', 'config'] as const)(
    'keeps Transfer disabled while %s has only cached data and is refetching',
    async (source) => {
      const mocks = installMocks()
      const pending = deferred<never>()
      const queryClient = createQueryClient()
      queryClient.setQueryData(referralsQueryKeys.overview, overview)
      queryClient.setQueryData(walletQueryKeys.wallet, wallet)
      queryClient.setQueryData(accountQueryKeys.config, config)
      if (source === 'overview')
        mocks.getOverview.mockReturnValue(pending.promise)
      if (source === 'wallet') mocks.getWallet.mockReturnValue(pending.promise)
      if (source === 'config') mocks.getConfig.mockReturnValue(pending.promise)
      renderReferrals(queryClient)

      const section = await transferSection()
      expect(
        await section.findByRole('button', { name: '佣金划转' }),
      ).toBeDisabled()
      expect(section.getByRole('textbox', { name: '划转金额' })).toBeDisabled()
      expect(mocks.transferCommission).not.toHaveBeenCalled()
    },
  )

  it('locks same-tick double confirm to exactly one POST', async () => {
    const mocks = installMocks()
    const transfer = deferred<{ transferred: true }>()
    mocks.transferCommission.mockReturnValue(transfer.promise)
    renderReferrals()
    const form = await openConfirmation()
    const confirm = within(form.dialog).getByRole('button', {
      name: '确认划转',
    })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(mocks.transferCommission).toHaveBeenCalledOnce())
    expect(mocks.transferCommission).toHaveBeenCalledWith('transfer-token', {
      amountMinor: 1_000,
    })
    expect(
      within(screen.getByRole('dialog')).getByText('正在划转…'),
    ).toBeVisible()
    act(() => transfer.resolve({ transferred: true }))
    expect(await screen.findByText('佣金划转已确认。')).toBeInTheDocument()
    expect(mocks.transferCommission).toHaveBeenCalledOnce()
  })

  it('blocks a same-tick confirm when current Wallet authority starts fetching', async () => {
    const mocks = installMocks()
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    const pending = deferred<typeof wallet>()
    void queryClient.fetchQuery({
      queryKey: walletQueryKeys.wallet,
      queryFn: () => pending.promise,
      staleTime: 0,
    })
    fireEvent.click(
      within(form.dialog).getByRole('button', { name: '确认划转' }),
    )

    expect(mocks.transferCommission).not.toHaveBeenCalled()
    expect(
      await screen.findByText(
        '当前资金状态已变化，请完成重新读取后重新确认金额。',
      ),
    ).toBeInTheDocument()
    act(() => pending.resolve(wallet))
  })

  it('rejects an old confirmation after Account Config semantics change', async () => {
    const mocks = installMocks()
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    act(() => {
      queryClient.setQueryData(accountQueryKeys.config, {
        currency: 'JPY',
        currencySymbol: '¥',
      })
    })
    await confirmTransfer(form)

    expect(mocks.transferCommission).not.toHaveBeenCalled()
    expect(
      await screen.findByText('结算币种已变化，请重新输入金额并再次确认。'),
    ).toBeInTheDocument()
    expect(
      (await transferSection()).getByRole('textbox', { name: '划转金额' }),
    ).toHaveValue('')
  })
})

describe('Commission Transfer outcomes and reconciliation', () => {
  it('preserves confirmed success and refetches only Overview and Wallet', async () => {
    const mocks = installMocks()
    mocks.getOverview.mockResolvedValueOnce(overview).mockResolvedValueOnce({
      ...overview,
      stats: { ...overview.stats, availableCommissionMinor: 9_000 },
    })
    mocks.getWallet
      .mockResolvedValueOnce(wallet)
      .mockResolvedValueOnce({ balanceMinor: 6_000 })
    renderReferrals()
    const form = await openConfirmation()
    await confirmTransfer(form)

    expect(await screen.findByText('佣金划转已确认。')).toBeInTheDocument()
    expect(
      screen.getByText('已重新读取当前可用佣金和账户余额。'),
    ).toBeInTheDocument()
    expect(form.input).toHaveValue('')
    expect(mocks.getOverview).toHaveBeenCalledTimes(2)
    expect(mocks.getWallet).toHaveBeenCalledTimes(2)
    expect(mocks.getCommissions).toHaveBeenCalledOnce()
    expect(mocks.getWithdrawalOptions).toHaveBeenCalledOnce()
    expect(screen.queryByText(/划转后|已到账|转入成功/)).toBeNull()
  })

  it.each(['overview', 'wallet', 'both'] as const)(
    'keeps confirmed success fail closed when %s reconciliation fails',
    async (source) => {
      const mocks = installMocks()
      if (source === 'overview' || source === 'both') {
        mocks.getOverview
          .mockResolvedValueOnce(overview)
          .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      }
      if (source === 'wallet' || source === 'both') {
        mocks.getWallet
          .mockResolvedValueOnce(wallet)
          .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      }
      renderReferrals()
      const form = await openConfirmation()
      await confirmTransfer(form)

      expect(
        await screen.findByText(
          '佣金划转已确认，但暂时无法完整读取最新资金状态。',
          {},
          { timeout: 3_000 },
        ),
      ).toBeInTheDocument()
      const section = await transferSection()
      expect(section.getByRole('button', { name: '佣金划转' })).toBeDisabled()
      expect(mocks.transferCommission).toHaveBeenCalledOnce()

      mocks.getOverview.mockResolvedValue(overview)
      mocks.getWallet.mockResolvedValue(wallet)
      await form.user.click(
        section.getByRole('button', {
          name: '重新读取佣金和账户余额',
        }),
      )
      await waitFor(() =>
        expect(section.getByRole('button', { name: '佣金划转' })).toBeEnabled(),
      )
      expect(mocks.transferCommission).toHaveBeenCalledOnce()
    },
  )

  it.each([
    [
      'INSUFFICIENT_COMMISSION_BALANCE',
      409,
      '当前可用佣金不足，请重新读取最新佣金后调整划转金额。',
    ],
    [
      'COMMISSION_TRANSFER_FAILED',
      502,
      '佣金划转未能完成，请重新读取当前资金状态后再试。',
    ],
    ['VALIDATION_ERROR', 400, '当前划转请求无效，请调整金额后重新确认。'],
  ] as const)(
    'handles %s as a definitive rejection with financial reconciliation',
    async (code, status, message) => {
      const mocks = installMocks()
      mocks.transferCommission.mockRejectedValue(apiError(code, status))
      renderReferrals()
      const form = await openConfirmation()
      await confirmTransfer(form)

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.queryByText('private upstream detail')).toBeNull()
      expect(screen.queryByText('佣金划转已确认。')).toBeNull()
      expect(mocks.transferCommission).toHaveBeenCalledOnce()
      expect(mocks.getOverview).toHaveBeenCalledTimes(2)
      expect(mocks.getWallet).toHaveBeenCalledTimes(2)
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
        'transfer-token',
      )
    },
  )
})

describe('Commission Transfer UNKNOWN safety', () => {
  it.each([
    ['NETWORK_ERROR', apiError('NETWORK_ERROR', 0)],
    ['UPSTREAM_TIMEOUT', apiError('UPSTREAM_TIMEOUT', 504)],
    ['UPSTREAM_ERROR', apiError('UPSTREAM_ERROR')],
    ['MALFORMED_RESPONSE', apiError('MALFORMED_RESPONSE', 200)],
    ['plain Error', new Error('private exception')],
  ])(
    'keeps %s UNKNOWN even when recovered deltas exactly match',
    async (_name, error) => {
      const mocks = installMocks()
      mocks.transferCommission.mockRejectedValue(error)
      mocks.getOverview.mockResolvedValueOnce(overview).mockResolvedValueOnce({
        ...overview,
        stats: { ...overview.stats, availableCommissionMinor: 9_000 },
      })
      mocks.getWallet
        .mockResolvedValueOnce(wallet)
        .mockResolvedValueOnce({ balanceMinor: 6_000 })
      renderReferrals()
      const form = await openConfirmation()
      await confirmTransfer(form)

      expect(
        await screen.findByText('佣金划转结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          '已重新读取当前可用佣金和账户余额。请先核对资金状态，避免重复划转。',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText(/划转成功|已到账|已转入/)).toBeNull()
      expect(screen.queryByText('佣金划转未能完成')).toBeNull()
      expect(form.input).toHaveValue('')
      expect(mocks.transferCommission).toHaveBeenCalledOnce()
      expect(
        (await transferSection()).getByRole('button', { name: '佣金划转' }),
      ).toBeDisabled()
    },
  )

  it('activates the content-free marker before financial recovery completes', async () => {
    const mocks = installMocks()
    const overviewRecovery = deferred<typeof overview>()
    const walletRecovery = deferred<typeof wallet>()
    mocks.transferCommission.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockReturnValueOnce(overviewRecovery.promise)
    mocks.getWallet
      .mockResolvedValueOnce(wallet)
      .mockReturnValueOnce(walletRecovery.promise)
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    await confirmTransfer(form)

    await waitFor(() => expect(mocks.transferCommission).toHaveBeenCalledOnce())
    expect(
      queryClient.getQueryData(commissionTransferLocalGuardKeys.uncertainty),
    ).toBe('active')
    expect(
      JSON.stringify(
        queryClient.getQueryData(commissionTransferLocalGuardKeys.uncertainty),
      ),
    ).not.toMatch(/1000|transfer-token|CNY|member@example.com/)
    expect(form.input).toHaveValue('')

    act(() => overviewRecovery.resolve(overview))
    act(() => walletRecovery.resolve(wallet))
    await screen.findByRole('checkbox', {
      name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
    })
  })

  it('fails closed on recovery failure, then requires acknowledgement and a new confirmation', async () => {
    const mocks = installMocks()
    mocks.transferCommission
      .mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
      .mockResolvedValueOnce({ transferred: true })
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
    renderReferrals()
    const form = await openConfirmation()
    await confirmTransfer(form)

    const section = await transferSection()
    expect(
      await screen.findByText(
        '当前资金状态暂时无法完整读取。请先恢复读取，暂时不要再次划转。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(section.queryByRole('checkbox')).toBeNull()
    mocks.getOverview.mockResolvedValue(overview)
    mocks.getWallet.mockResolvedValue(wallet)
    await form.user.click(
      section.getByRole('button', { name: '重新读取佣金和账户余额' }),
    )
    const acknowledgement = await section.findByRole('checkbox', {
      name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
    })
    await form.user.click(acknowledgement)
    expect(mocks.transferCommission).toHaveBeenCalledOnce()
    await form.user.type(
      section.getByRole('textbox', { name: '划转金额' }),
      '10',
    )
    await form.user.click(section.getByRole('button', { name: '佣金划转' }))
    expect(mocks.transferCommission).toHaveBeenCalledOnce()
    await form.user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '确认划转',
      }),
    )
    expect(await screen.findByText('佣金划转已确认。')).toBeInTheDocument()
    expect(mocks.transferCommission).toHaveBeenCalledTimes(2)
  })

  it('keeps active uncertainty across remount and clears it on session logout', async () => {
    const mocks = installMocks()
    mocks.transferCommission.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    const queryClient = createQueryClient()
    const first = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmTransfer(form)
    await screen.findByRole('checkbox', {
      name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
    })
    expect(
      queryClient.getQueryData(commissionTransferLocalGuardKeys.uncertainty),
    ).toBe('active')

    first.unmount()
    renderReferrals(queryClient)
    const section = await transferSection()
    const input = await section.findByRole('textbox', { name: '划转金额' })
    expect(input).toHaveValue('')
    expect(input).toBeDisabled()
    expect(
      await section.findByRole('checkbox', {
        name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
      }),
    ).toBeInTheDocument()
    expect(mocks.transferCommission).toHaveBeenCalledOnce()

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '退出登录' }))
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(
      queryClient.getQueryData(commissionTransferLocalGuardKeys.uncertainty),
    ).toBeUndefined()
  })

  it('allows ordinary empty-form remount only after explicit acknowledgement', async () => {
    const mocks = installMocks()
    mocks.transferCommission.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    const queryClient = createQueryClient()
    const first = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmTransfer(form)
    const acknowledgement = await screen.findByRole('checkbox', {
      name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
    })
    await form.user.click(acknowledgement)
    expect(
      queryClient.getQueryData(commissionTransferLocalGuardKeys.uncertainty),
    ).toBe('acknowledged')

    first.unmount()
    renderReferrals(queryClient)
    const section = await transferSection()
    const input = await section.findByRole('textbox', { name: '划转金额' })
    await waitFor(() => expect(input).toBeEnabled())
    expect(input).toHaveValue('')
    expect(section.queryByRole('checkbox')).toBeNull()
    expect(mocks.transferCommission).toHaveBeenCalledOnce()
  })

  it('keeps a failed UNKNOWN recovery guarded after remount until both reads recover', async () => {
    const mocks = installMocks()
    mocks.transferCommission.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
    const queryClient = createQueryClient()
    const first = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmTransfer(form)
    await screen.findByText(
      '当前资金状态暂时无法完整读取。请先恢复读取，暂时不要再次划转。',
      {},
      { timeout: 3_000 },
    )
    first.unmount()

    const overviewRemount = deferred<typeof overview>()
    const walletRemount = deferred<typeof wallet>()
    mocks.getOverview.mockReturnValue(overviewRemount.promise)
    mocks.getWallet.mockReturnValue(walletRemount.promise)
    renderReferrals(queryClient)
    const section = await transferSection()
    expect(section.getByRole('button', { name: '佣金划转' })).toBeDisabled()
    expect(mocks.transferCommission).toHaveBeenCalledOnce()
    act(() => overviewRemount.resolve(overview))
    act(() => walletRemount.resolve(wallet))
    expect(
      await section.findByRole('checkbox', {
        name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
      }),
    ).toBeInTheDocument()
    expect(section.getByRole('button', { name: '佣金划转' })).toBeDisabled()
  })

  it.each(['overview', 'wallet'] as const)(
    'clears Session Core when UNKNOWN %s recovery returns AUTH_FAILED',
    async (source) => {
      const mocks = installMocks()
      mocks.transferCommission.mockRejectedValue(apiError('NETWORK_ERROR', 0))
      if (source === 'overview') {
        mocks.getOverview
          .mockResolvedValueOnce(overview)
          .mockRejectedValueOnce(apiError('AUTH_FAILED', 401))
      } else {
        mocks.getWallet
          .mockResolvedValueOnce(wallet)
          .mockRejectedValueOnce(apiError('AUTH_FAILED', 401))
      }
      const { queryClient, router } = renderReferrals()
      const form = await openConfirmation()
      await confirmTransfer(form)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(
        queryClient.getQueryData(referralsQueryKeys.overview),
      ).toBeUndefined()
      expect(queryClient.getQueryData(walletQueryKeys.wallet)).toBeUndefined()
    },
  )

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'clears Session Core when Transfer returns %s',
    async (code) => {
      const mocks = installMocks()
      mocks.transferCommission.mockRejectedValue(apiError(code, 401))
      const { queryClient, router } = renderReferrals()
      const form = await openConfirmation()
      await confirmTransfer(form)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(
        queryClient.getQueryData(referralsQueryKeys.overview),
      ).toBeUndefined()
      expect(queryClient.getQueryData(walletQueryKeys.wallet)).toBeUndefined()
      expect(
        queryClient.getQueryData(commissionTransferLocalGuardKeys.uncertainty),
      ).toBeUndefined()
    },
  )
})
