import type { QueryClient } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  renderHook,
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
import type { AuthApi, CurrentUser } from '@/features/auth/auth-api'
import { authQueryKeys } from '@/features/auth/auth-query-keys'
import { ordersApi } from '@/features/orders/orders-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { subscriptionQueryKeys } from '@/features/subscription/subscription-queries'
import type {
  GiftCardEffect,
  RedeemedGiftCard,
} from '@/features/wallet/gift-card-api'
import { giftCardApi } from '@/features/wallet/gift-card-api'
import { giftCardMutationKeys } from '@/features/wallet/gift-card-queries'
import { walletApi } from '@/features/wallet/wallet-api'
import { useWalletMutationCoordinator } from '@/features/wallet/wallet-mutation-coordinator'
import { walletQueryKeys } from '@/features/wallet/wallet-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const currentUser: CurrentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active',
}

const recoveredUser: CurrentUser = {
  ...currentUser,
  expiresAt: '2031-01-01T00:00:00.000Z',
}

const overview = {
  product: { id: '7', name: 'Recovered Plan' },
  expiresAt: '2031-01-01T00:00:00.000Z',
  traffic: {
    uploadedBytes: 10,
    downloadedBytes: 20,
    allowanceBytes: 30,
  },
  deviceLimit: 3,
  activeDevices: 1,
  resetDay: 15,
  renewalAllowed: true,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function installMocks() {
  const getWallet = vi
    .spyOn(walletApi, 'getWallet')
    .mockResolvedValue({ balanceMinor: 10_000 })
  const createDeposit = vi
    .spyOn(walletApi, 'createDeposit')
    .mockResolvedValue({ id: 'deposit-order-001' })
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  const getOverview = vi
    .spyOn(subscriptionApi, 'getOverview')
    .mockResolvedValue(overview)
  const getAccess = vi.spyOn(subscriptionApi, 'getAccess').mockResolvedValue({
    eligible: false,
    accessUrl: null,
  })
  const redeem = vi.spyOn(giftCardApi, 'redeem').mockResolvedValue({
    redeemed: true,
    effect: { type: 'trafficReset' },
  })
  const getOrders = vi.spyOn(ordersApi, 'getList').mockResolvedValue([])
  const getCurrentUser = vi.fn().mockResolvedValue(currentUser)
  return {
    createDeposit,
    getAccess,
    getConfig,
    getCurrentUser,
    getOrders,
    getOverview,
    getWallet,
    redeem,
  }
}

type Mocks = ReturnType<typeof installMocks>

function renderWallet(
  mocks: Mocks,
  queryClient: QueryClient = createQueryClient(),
) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'wallet-token')
  queryClient.setQueryData(subscriptionQueryKeys.access, {
    eligible: true,
    accessUrl:
      'https://gateway.example/api/v1/access/subscription?token=fake-token',
  })
  queryClient.setQueryData(
    subscriptionQueryKeys.entryAccess('https://entry.example', 0),
    {
      accessUrl:
        'https://entry.example/api/v1/client/subscribe?token=fake-entry-token',
    },
  )
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: mocks.getCurrentUser,
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

async function openGiftConfirmation(
  code = 'fake-card-code',
  user = userEvent.setup(),
) {
  const input = await screen.findByLabelText('礼品卡兑换码')
  await waitFor(() => expect(input).toBeEnabled())
  await user.clear(input)
  await user.type(input, code)
  await user.click(screen.getByRole('button', { name: '兑换礼品卡' }))
  return { dialog: screen.getByRole('dialog'), input, user }
}

async function confirmGift(
  dialog: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    within(dialog).getByRole('checkbox', {
      name: '我确认兑换此礼品卡，并理解账户状态可能立即发生变化',
    }),
  )
  await user.click(
    within(dialog).getByRole('button', { name: '确认兑换礼品卡' }),
  )
}

function expectLoggedOut(
  router: ReturnType<typeof createAppRouter>,
  queryClient: QueryClient,
) {
  expect(router.state.location.pathname).toBe('/login')
  expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  expect(queryClient.getQueryData(['private-state'])).toBeUndefined()
  expect(queryClient.getQueryData(authQueryKeys.me)).toBeUndefined()
  expect(queryClient.getQueryData(walletQueryKeys.wallet)).toBeUndefined()
}

describe('Gift Card confirmation and privacy', () => {
  it('uses password semantics, explicit reveal, masked confirmation, and focus restoration', async () => {
    const mocks = installMocks()
    renderWallet(mocks)
    const user = userEvent.setup()
    const input = await screen.findByLabelText('礼品卡兑换码')
    await waitFor(() => expect(input).toBeEnabled())
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'off')
    expect(input).toHaveAttribute('spellcheck', 'false')

    await user.type(input, 'Abcd-Efgh-Ijkl')
    await user.click(screen.getByRole('button', { name: '显示礼品卡兑换码' }))
    expect(input).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: '隐藏礼品卡兑换码' }))
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: '兑换礼品卡' }))

    const dialog = screen.getByRole('dialog')
    expect(mocks.redeem).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Ab••••••kl')).toBeInTheDocument()
    expect(within(dialog).queryByText('Abcd-Efgh-Ijkl')).toBeNull()
    const confirm = within(dialog).getByRole('button', {
      name: '确认兑换礼品卡',
    })
    expect(confirm).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox'))
    expect(confirm).toBeEnabled()
    await user.click(within(dialog).getByRole('button', { name: '返回' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: '兑换礼品卡' })).toHaveFocus()
    expect(mocks.redeem).not.toHaveBeenCalled()
    expect(routerSafeLocation()).not.toContain('Abcd-Efgh-Ijkl')
    expect(JSON.stringify(localStorage)).not.toContain('Abcd-Efgh-Ijkl')
    expect(JSON.stringify(sessionStorage)).not.toContain('Abcd-Efgh-Ijkl')
  })

  it.each(['', 'x'.repeat(256)])(
    'rejects code length %i before confirmation',
    async (code) => {
      const mocks = installMocks()
      renderWallet(mocks)
      const input = await screen.findByLabelText('礼品卡兑换码')
      await waitFor(() => expect(input).toBeEnabled())
      fireEvent.change(input, { target: { value: code } })
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: '兑换礼品卡' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(
        screen.getByText('请输入 1 至 255 个字符的礼品卡兑换码。'),
      ).toBeInTheDocument()
      expect(mocks.redeem).not.toHaveBeenCalled()
    },
  )

  it('allows only one same-tick POST and locks every Gift Card action while pending', async () => {
    const mocks = installMocks()
    const pendingRedeem = deferred<RedeemedGiftCard>()
    mocks.redeem.mockReturnValue(pendingRedeem.promise)
    renderWallet(mocks)
    const { dialog, input, user } = await openGiftConfirmation()
    await user.click(within(dialog).getByRole('checkbox'))
    const confirm = within(dialog).getByRole('button', {
      name: '确认兑换礼品卡',
    })

    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledOnce())
    expect(input).toBeDisabled()
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '正在兑换…',
      }),
    ).toBeDisabled()
    expect(document.getElementById('gift-card-reveal')).toBeDisabled()
    act(() =>
      pendingRedeem.resolve({
        redeemed: true,
        effect: { type: 'trafficReset' },
      }),
    )
    expect(await screen.findByText('礼品卡已兑换')).toBeInTheDocument()
    expect(mocks.redeem).toHaveBeenCalledOnce()
  })
})

describe('Gift Card confirmed success', () => {
  it.each([
    [{ type: 'balance', amountMinor: -100 }, '余额变动：-¥1.00 CNY'],
    [{ type: 'validity', days: -30 }, '有效期变动：-30 天'],
    [{ type: 'traffic', gigabytes: -5 }, '流量变动：-5 GiB'],
    [{ type: 'trafficReset' }, '流量已按服务端规则重置'],
    [{ type: 'plan', durationDays: 0 }, '套餐持续时间变动：0 天'],
    [
      { type: 'plan', durationDays: null },
      '套餐已按服务端规则变更，未提供固定持续天数',
    ],
  ] as const)(
    'shows the authoritative effect %# and reconciles all account reads',
    async (effect, expected) => {
      const mocks = installMocks()
      mocks.redeem.mockResolvedValue({
        redeemed: true,
        effect: effect as GiftCardEffect,
      })
      const queryClient = createQueryClient()
      renderWallet(mocks, queryClient)
      const { dialog, input, user } = await openGiftConfirmation()
      await confirmGift(dialog, user)

      expect(await screen.findByText('礼品卡已兑换')).toBeInTheDocument()
      expect(await screen.findByText(expected)).toBeInTheDocument()
      expect(
        await screen.findByText(
          '已重新读取最新账户状态，请以当前页面和订阅页面显示为准。',
        ),
      ).toBeInTheDocument()
      expect(input).toHaveValue('')
      expect(input).toHaveAttribute('type', 'password')
      expect(mocks.getWallet).toHaveBeenCalledTimes(2)
      expect(mocks.getCurrentUser).toHaveBeenCalledTimes(2)
      expect(mocks.getOverview).toHaveBeenCalledOnce()
      expect(mocks.getAccess).not.toHaveBeenCalled()
      expect(
        queryClient.getQueryState(subscriptionQueryKeys.access)?.isInvalidated,
      ).toBe(true)
      expect(
        queryClient.getQueriesData({
          queryKey: subscriptionQueryKeys.entryAccessRoot,
        }),
      ).toEqual([])
      expect(JSON.stringify(giftCardMutationKeys.redeem)).not.toContain(
        'fake-card-code',
      )
      expect(
        JSON.stringify(
          queryClient
            .getMutationCache()
            .getAll()
            .map((entry) => entry.state),
        ),
      ).not.toContain('fake-card-code')
      expect(screen.queryByText(/^新余额：/)).toBeNull()
      expect(screen.queryByText(/^新到期时间：/)).toBeNull()
      expect(screen.queryByText(/^新套餐：/)).toBeNull()
    },
  )

  it('falls back to signed minor units when currency cannot be read', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockRejectedValue(
      new ApiError({
        status: 200,
        code: 'MALFORMED_RESPONSE',
        message: 'config',
      }),
    )
    mocks.redeem.mockResolvedValue({
      redeemed: true,
      effect: { type: 'balance', amountMinor: -100 },
    })
    renderWallet(mocks)
    const { dialog, user } = await openGiftConfirmation()
    await confirmGift(dialog, user)

    expect(
      await screen.findByText('余额变动：-100 最小货币单位'),
    ).toBeInTheDocument()
    expect(screen.queryByText('-¥1.00 CNY')).toBeNull()
  })

  it('keeps confirmed success and fails closed when Me reconciliation fails', async () => {
    const mocks = installMocks()
    mocks.getCurrentUser
      .mockResolvedValueOnce(currentUser)
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'private me error',
        }),
      )
      .mockResolvedValueOnce(recoveredUser)
    renderWallet(mocks)
    const { dialog, input, user } = await openGiftConfirmation()
    await confirmGift(dialog, user)

    expect(await screen.findByText('礼品卡已兑换')).toBeInTheDocument()
    expect(
      await screen.findByText(
        '暂时无法完整读取最新账户状态，请先重新读取账户状态。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('兑换失败')).toBeNull()
    expect(input).toHaveValue('')
    expect(screen.getByRole('button', { name: '兑换礼品卡' })).toBeDisabled()
    expect(mocks.redeem).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '重新读取账户状态' }))

    expect(
      await screen.findByText(
        '已重新读取最新账户状态，请以当前页面和订阅页面显示为准。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '兑换礼品卡' })).toBeEnabled()
    expect(mocks.redeem).toHaveBeenCalledOnce()
  })
})

describe('Gift Card definitive errors', () => {
  it.each([
    ['GIFT_CARD_NOT_FOUND', 404, '未找到该礼品卡。'],
    ['GIFT_CARD_NOT_ACTIVE', 409, '该礼品卡尚未生效。'],
    ['GIFT_CARD_EXPIRED', 409, '该礼品卡已过期。'],
    ['GIFT_CARD_USAGE_LIMIT_REACHED', 409, '该礼品卡的使用次数已达到限制。'],
    ['GIFT_CARD_ALREADY_REDEEMED', 409, '该礼品卡已被当前账户使用过。'],
    ['GIFT_CARD_NOT_APPLICABLE', 409, '该礼品卡当前不适用于此账户。'],
    ['GIFT_CARD_REDEEM_FAILED', 502, '礼品卡兑换未能完成，请重新确认后再试。'],
    ['VALIDATION_ERROR', 400, '礼品卡信息无效，请检查后重新提交。'],
  ] as const)(
    'handles %s without retry, logout, or raw error text',
    async (code, status, message) => {
      const mocks = installMocks()
      mocks.redeem.mockRejectedValue(
        new ApiError({ status, code, message: 'private upstream detail' }),
      )
      const queryClient = createQueryClient()
      renderWallet(mocks, queryClient)
      const { dialog, input, user } = await openGiftConfirmation()
      await confirmGift(dialog, user)

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.queryByText('private upstream detail')).toBeNull()
      expect(input).toHaveValue('fake-card-code')
      expect(mocks.redeem).toHaveBeenCalledOnce()
      expect(mocks.getWallet).toHaveBeenCalledOnce()
      expect(mocks.getCurrentUser).toHaveBeenCalledOnce()
      expect(mocks.getOverview).not.toHaveBeenCalled()
      expect(
        JSON.stringify(
          queryClient
            .getMutationCache()
            .getAll()
            .map((entry) => entry.state),
        ),
      ).not.toContain('fake-card-code')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
        'wallet-token',
      )

      await user.click(screen.getByRole('button', { name: '兑换礼品卡' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(mocks.redeem).toHaveBeenCalledOnce()
    },
  )
})

describe('Gift Card unknown-result recovery', () => {
  it.each([
    [0, 'NETWORK_ERROR'],
    [504, 'UPSTREAM_TIMEOUT'],
    [502, 'UPSTREAM_ERROR'],
    [200, 'MALFORMED_RESPONSE'],
    [0, 'PLAIN_ERROR'],
  ] as const)(
    'keeps %s/%s unknown after authoritative account changes',
    async (status, code) => {
      const mocks = installMocks()
      mocks.getWallet
        .mockResolvedValueOnce({ balanceMinor: 10_000 })
        .mockResolvedValueOnce({ balanceMinor: 20_000 })
      mocks.getCurrentUser
        .mockResolvedValueOnce(currentUser)
        .mockResolvedValueOnce(recoveredUser)
      mocks.redeem.mockRejectedValue(
        code === 'PLAIN_ERROR'
          ? new Error('unexpected private error')
          : new ApiError({
              status,
              code,
              message: 'private unknown detail',
            }),
      )
      const queryClient = createQueryClient()
      renderWallet(mocks, queryClient)
      const { dialog, input, user } = await openGiftConfirmation()
      await confirmGift(dialog, user)

      expect(
        await screen.findByText('兑换结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        await screen.findByText(
          '已重新读取当前账户状态。请核对账户状态，避免重复兑换。',
        ),
      ).toBeInTheDocument()
      expect(screen.getByText('¥200.00 CNY')).toBeInTheDocument()
      expect(screen.queryByText('礼品卡已兑换')).toBeNull()
      expect(screen.queryByText(/兑换失败|余额变动|有效期变动/)).toBeNull()
      expect(
        screen.queryByText(/private unknown|unexpected private/),
      ).toBeNull()
      expect(input).toHaveValue('fake-card-code')
      expect(mocks.redeem).toHaveBeenCalledOnce()
      expect(mocks.getWallet).toHaveBeenCalledTimes(2)
      expect(mocks.getCurrentUser).toHaveBeenCalledTimes(2)
      expect(mocks.getOverview).toHaveBeenCalledOnce()
      expect(mocks.getAccess).not.toHaveBeenCalled()
      expect(
        queryClient.getQueryState(subscriptionQueryKeys.access)?.isInvalidated,
      ).toBe(true)
      expect(
        JSON.stringify(
          queryClient
            .getMutationCache()
            .getAll()
            .map((entry) => entry.state),
        ),
      ).not.toContain('fake-card-code')
      expect(screen.getByRole('button', { name: '兑换礼品卡' })).toBeDisabled()
      expect(
        screen.getByRole('checkbox', {
          name: '我已核对当前账户状态，仍需再次提交此礼品卡',
        }),
      ).toBeInTheDocument()
    },
  )

  it.each(['wallet', 'me', 'overview'] as const)(
    'fails closed when %s recovery fails until all manual reads succeed',
    async (source) => {
      const mocks = installMocks()
      const readError = new ApiError({
        status: 200,
        code: 'MALFORMED_RESPONSE',
        message: 'private recovery error',
      })
      mocks.redeem.mockRejectedValue(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
      )
      if (source === 'wallet') {
        mocks.getWallet
          .mockResolvedValueOnce({ balanceMinor: 10_000 })
          .mockRejectedValueOnce(readError)
          .mockResolvedValueOnce({ balanceMinor: 20_000 })
      } else if (source === 'me') {
        mocks.getCurrentUser
          .mockResolvedValueOnce(currentUser)
          .mockRejectedValueOnce(readError)
          .mockResolvedValueOnce(recoveredUser)
      } else {
        mocks.getOverview
          .mockRejectedValueOnce(readError)
          .mockResolvedValueOnce(overview)
      }
      renderWallet(mocks)
      const { dialog, user } = await openGiftConfirmation()
      await confirmGift(dialog, user)

      expect(
        await screen.findByText(
          '暂时无法完整读取当前账户状态，请先重新读取账户状态，避免重复兑换。',
        ),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '兑换礼品卡' })).toBeDisabled()
      expect(screen.queryByRole('checkbox')).toBeNull()
      expect(mocks.redeem).toHaveBeenCalledOnce()

      await user.click(screen.getByRole('button', { name: '重新读取账户状态' }))

      expect(
        await screen.findByRole('checkbox', {
          name: '我已核对当前账户状态，仍需再次提交此礼品卡',
        }),
      ).toBeInTheDocument()
      expect(mocks.redeem).toHaveBeenCalledOnce()
    },
  )

  it('requires UNKNOWN acknowledgement and a new standard confirmation before a second POST', async () => {
    const mocks = installMocks()
    mocks.redeem
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 409,
          code: 'GIFT_CARD_ALREADY_REDEEMED',
          message: 'private already redeemed detail',
        }),
      )
    renderWallet(mocks)
    const first = await openGiftConfirmation()
    await confirmGift(first.dialog, first.user)
    await screen.findByText('兑换结果暂时无法确认。')

    const redeemButton = screen.getByRole('button', { name: '兑换礼品卡' })
    expect(redeemButton).toBeDisabled()
    await first.user.click(
      screen.getByRole('checkbox', {
        name: '我已核对当前账户状态，仍需再次提交此礼品卡',
      }),
    )
    expect(redeemButton).toBeEnabled()
    await first.user.click(redeemButton)
    const secondDialog = screen.getByRole('dialog')
    expect(mocks.redeem).toHaveBeenCalledOnce()
    expect(
      within(secondDialog).getByRole('button', {
        name: '确认兑换礼品卡',
      }),
    ).toBeDisabled()
    await confirmGift(secondDialog, first.user)

    expect(
      await screen.findByText('该礼品卡已被当前账户使用过。'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/上一次|第一次兑换成功/)).toBeNull()
    expect(mocks.redeem).toHaveBeenCalledTimes(2)
  })
})

describe('Gift Card and Deposit mutual exclusion', () => {
  it('blocks Gift Card while Deposit is pending', async () => {
    const mocks = installMocks()
    const pendingDeposit = deferred<{ id: string }>()
    mocks.createDeposit.mockReturnValue(pendingDeposit.promise)
    renderWallet(mocks)
    const user = userEvent.setup()
    const giftInput = await screen.findByLabelText('礼品卡兑换码')
    await waitFor(() => expect(giftInput).toBeEnabled())
    await user.type(giftInput, 'fake-card-code')
    const giftButton = screen.getByRole('button', { name: '兑换礼品卡' })
    const amount = screen.getByLabelText('充值金额')
    await user.type(amount, '100')
    await user.click(screen.getByRole('button', { name: '创建充值订单' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(
      within(dialog).getByRole('button', { name: '确认创建充值订单' }),
    )

    await waitFor(() => expect(mocks.createDeposit).toHaveBeenCalledOnce())
    expect(giftButton).toBeDisabled()
    fireEvent.click(giftButton)
    expect(mocks.redeem).not.toHaveBeenCalled()
    act(() => pendingDeposit.resolve({ id: 'deposit-order-001' }))
    await screen.findByText('充值订单已创建')
  })

  it('blocks Deposit while Gift Card is pending', async () => {
    const mocks = installMocks()
    const pendingRedeem = deferred<RedeemedGiftCard>()
    mocks.redeem.mockReturnValue(pendingRedeem.promise)
    renderWallet(mocks)
    const depositButton = await screen.findByRole('button', {
      name: '创建充值订单',
    })
    const { dialog, user } = await openGiftConfirmation()
    await user.click(within(dialog).getByRole('checkbox'))
    fireEvent.click(
      within(dialog).getByRole('button', { name: '确认兑换礼品卡' }),
    )

    await waitFor(() => expect(mocks.redeem).toHaveBeenCalledOnce())
    expect(depositButton).toBeDisabled()
    fireEvent.click(depositButton)
    expect(mocks.createDeposit).not.toHaveBeenCalled()
    act(() =>
      pendingRedeem.resolve({
        redeemed: true,
        effect: { type: 'trafficReset' },
      }),
    )
    await screen.findByText('礼品卡已兑换')
  })

  it('allows at most one Wallet mutation to acquire in the same tick', () => {
    const { result } = renderHook(() => useWalletMutationCoordinator())

    expect(result.current.tryAcquire('deposit-create')).toBe(true)
    expect(result.current.tryAcquire('gift-card-redeem')).toBe(false)
  })
})

describe('Gift Card authentication boundaries', () => {
  it.each([
    ['post', 'AUTH_REQUIRED'],
    ['post', 'AUTH_FAILED'],
    ['wallet', 'AUTH_REQUIRED'],
    ['wallet', 'AUTH_FAILED'],
    ['me', 'AUTH_REQUIRED'],
    ['me', 'AUTH_FAILED'],
    ['overview', 'AUTH_REQUIRED'],
    ['overview', 'AUTH_FAILED'],
    ['manual', 'AUTH_REQUIRED'],
    ['manual', 'AUTH_FAILED'],
  ] as const)(
    'clears the full session when %s returns %s',
    async (source, code) => {
      const mocks = installMocks()
      const authError = new ApiError({
        status: 401,
        code,
        message: 'private auth detail',
      })
      if (source === 'post') {
        mocks.redeem.mockRejectedValue(authError)
      } else if (source === 'wallet') {
        mocks.getWallet
          .mockResolvedValueOnce({ balanceMinor: 10_000 })
          .mockRejectedValueOnce(authError)
      } else if (source === 'me') {
        mocks.getCurrentUser
          .mockResolvedValueOnce(currentUser)
          .mockRejectedValueOnce(authError)
      } else if (source === 'overview') {
        mocks.getOverview.mockRejectedValueOnce(authError)
      } else {
        const ordinary = new ApiError({
          status: 502,
          code: 'UPSTREAM_ERROR',
          message: 'recovery unavailable',
        })
        mocks.getWallet
          .mockResolvedValueOnce({ balanceMinor: 10_000 })
          .mockRejectedValueOnce(ordinary)
          .mockRejectedValueOnce(authError)
      }
      const queryClient = createQueryClient()
      queryClient.setQueryData(['private-state'], { private: true })
      const { router } = renderWallet(mocks, queryClient)
      const { dialog, user } = await openGiftConfirmation()
      await confirmGift(dialog, user)
      if (source === 'manual') {
        await user.click(
          await screen.findByRole('button', {
            name: '重新读取账户状态',
          }),
        )
      }

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
      expect(router.state.location.search).toEqual({})
    },
  )
})

function routerSafeLocation() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}
