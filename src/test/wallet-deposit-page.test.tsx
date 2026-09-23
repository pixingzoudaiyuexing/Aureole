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
import type { AuthApi } from '@/features/auth/auth-api'
import { ordersApi } from '@/features/orders/orders-api'
import { ordersQueryKeys } from '@/features/orders/orders-queries'
import { paymentApi } from '@/features/payments/payment-api'
import { walletApi } from '@/features/wallet/wallet-api'
import { walletQueryKeys } from '@/features/wallet/wallet-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const recoveredOrder = {
  id: 'same-looking-order',
  status: 'pending' as const,
  amountMinor: 10_000,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: null,
  expiresAt: null,
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
    .mockResolvedValue({ balanceMinor: 12_345 })
  const createDeposit = vi
    .spyOn(walletApi, 'createDeposit')
    .mockResolvedValue({ id: 'deposit-order-001' })
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  const getList = vi
    .spyOn(ordersApi, 'getList')
    .mockResolvedValue([recoveredOrder])
  const getStatus = vi
    .spyOn(ordersApi, 'getStatus')
    .mockResolvedValue({ id: recoveredOrder.id, status: 'pending' })
  const getMethods = vi.spyOn(paymentApi, 'getMethods').mockResolvedValue([])
  const checkout = vi
    .spyOn(paymentApi, 'checkout')
    .mockResolvedValue({ type: 'finished' })
  return {
    checkout,
    createDeposit,
    getConfig,
    getList,
    getMethods,
    getStatus,
    getWallet,
  }
}

function renderWallet(
  queryClient: QueryClient = createQueryClient(),
  valid = { current: true },
) {
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn(async () => {
      if (!valid.current)
        throw new ApiError({
          status: 401,
          code: 'AUTH_FAILED',
          message: 'Authentication failed',
        })
      return {
        email: 'member@example.com',
        expiresAt: null,
        status: 'active' as const,
      }
    }),
    logout: vi.fn(async () => {
      valid.current = false
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

async function openConfirmation(amount = '100', user = userEvent.setup()) {
  const input = await screen.findByRole('textbox', { name: '充值金额' })
  await waitFor(() => expect(input).toBeEnabled())
  await user.clear(input)
  await user.type(input, amount)
  await user.click(screen.getByRole('button', { name: '创建充值订单' }))
  const dialog = screen.getByRole('dialog')
  return { dialog, input, user }
}

async function confirmDeposit(
  dialog: HTMLElement,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    within(dialog).getByRole('button', { name: '确认创建充值订单' }),
  )
}

function expectLoggedOut(
  router: ReturnType<typeof createAppRouter>,
  queryClient: QueryClient,
) {
  expect(router.state.location.pathname).toBe('/login')
  expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  expect(queryClient.getQueryData(['private-state'])).toBeUndefined()
  expect(queryClient.getQueryData(walletQueryKeys.wallet)).toBeUndefined()
  expect(queryClient.getQueryData(ordersQueryKeys.list)).toBeUndefined()
}

describe('Wallet deposit creation', () => {
  it('requires a formatted confirmation before the first POST and restores focus', async () => {
    const mocks = installMocks()
    renderWallet()
    const { dialog, user } = await openConfirmation('100.5')

    expect(mocks.createDeposit).not.toHaveBeenCalled()
    expect(
      within(dialog).getByRole('heading', {
        name: '确认创建充值订单',
      }),
    ).toBeInTheDocument()
    expect(within(dialog).getByText('¥100.50 CNY')).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        '确认后将创建一张充值订单。订单创建后仍需完成支付，当前余额不会立即变化。',
      ),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: '创建充值订单' })).toHaveFocus()
    expect(mocks.createDeposit).not.toHaveBeenCalled()
  })

  it.each(['0', '1.001', '21474836.48', '-1', '1e2', 'abc'])(
    'rejects invalid CNY input %j before POST',
    async (amount) => {
      const mocks = installMocks()
      renderWallet()
      const user = userEvent.setup()
      const input = await screen.findByRole('textbox', { name: '充值金额' })
      await user.type(input, amount)
      await user.click(screen.getByRole('button', { name: '创建充值订单' }))

      expect(screen.queryByRole('dialog')).toBeNull()
      expect(
        screen.getByText('请输入大于零且符合 CNY 小数位规则的金额。'),
      ).toBeInTheDocument()
      expect(mocks.createDeposit).not.toHaveBeenCalled()
    },
  )

  it('converts JPY without fixed decimals and rejects a fractional input', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockResolvedValue({ currency: 'JPY', currencySymbol: '¥' })
    renderWallet()
    const user = userEvent.setup()
    const valid = await openConfirmation('100', user)
    expect(within(valid.dialog).getByText('¥100 JPY')).toBeInTheDocument()
    await user.click(within(valid.dialog).getByRole('button', { name: '返回' }))

    const input = screen.getByRole('textbox', { name: '充值金额' })
    await user.clear(input)
    await user.type(input, '1.0')
    await user.click(screen.getByRole('button', { name: '创建充值订单' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.createDeposit).not.toHaveBeenCalled()
  })

  it('disables deposit when Account Config is unavailable', async () => {
    const mocks = installMocks()
    mocks.getConfig.mockRejectedValue(
      new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'private' }),
    )
    renderWallet()

    const input = await screen.findByRole('textbox', { name: '充值金额' })
    await screen.findByText(
      '暂时无法读取结算币种，余额无法安全格式化。',
      {},
      { timeout: 3_000 },
    )
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: '创建充值订单' })).toBeDisabled()
    expect(mocks.createDeposit).not.toHaveBeenCalled()
  })

  it('uses a synchronous lock and keeps controls locked until recovery finishes', async () => {
    const mocks = installMocks()
    const created = deferred<{ id: string }>()
    mocks.createDeposit.mockReturnValue(created.promise)
    renderWallet()
    const { dialog, input, user } = await openConfirmation()
    const confirm = within(dialog).getByRole('button', {
      name: '确认创建充值订单',
    })

    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(mocks.createDeposit).toHaveBeenCalledOnce())
    expect(input).toBeDisabled()
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '正在创建…',
      }),
    ).toBeDisabled()
    act(() => created.resolve({ id: 'deposit-order-001' }))
    expect(await screen.findByText('充值订单已创建')).toBeInTheDocument()
    expect(mocks.createDeposit).toHaveBeenCalledOnce()
    expect(mocks.createDeposit).toHaveBeenCalledWith(
      useAuthSessionStore.getState().accessToken,
      {
        amountMinor: 10_000,
      },
    )
    void user
  })

  it('shows created ID, refreshes Orders, keeps Wallet authoritative, and hands off only by navigation', async () => {
    const mocks = installMocks()
    const { router } = renderWallet()
    const { dialog, user } = await openConfirmation()
    await confirmDeposit(dialog, user)

    expect(await screen.findByText('充值订单已创建')).toBeInTheDocument()
    expect(screen.getByText('订单编号：deposit-order-001')).toBeInTheDocument()
    expect(
      screen.getByText(
        '完成支付后，余额才会按服务端状态更新。订单创建不会立即改变余额。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('¥123.45 CNY')).toBeInTheDocument()
    expect(mocks.getWallet).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledOnce()
    expect(mocks.getMethods).not.toHaveBeenCalled()
    expect(mocks.checkout).not.toHaveBeenCalled()
    expect(mocks.getStatus).not.toHaveBeenCalled()
    expect(screen.queryByText(/充值成功|余额已到账/)).toBeNull()
    expect(JSON.stringify(localStorage)).not.toContain('deposit-order-001')
    expect(JSON.stringify(sessionStorage)).not.toContain('deposit-order-001')

    await user.click(screen.getByRole('link', { name: '前往订单支付' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/orders'))
  })

  it('handles WALLET_DEPOSIT_UNAVAILABLE without retrying or ending the session', async () => {
    const mocks = installMocks()
    mocks.createDeposit.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'WALLET_DEPOSIT_UNAVAILABLE',
        message: 'private pending rule',
      }),
    )
    renderWallet()
    const { dialog, user } = await openConfirmation()
    await confirmDeposit(dialog, user)

    expect(
      await screen.findByText(
        '当前已有待支付或处理中的订单，暂时不能创建新的充值订单。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('private pending rule')).toBeNull()
    expect(
      screen.getByRole('link', { name: '前往订单检查' }),
    ).toBeInTheDocument()
    expect(mocks.createDeposit).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  })

  it('preserves an invalid amount and requires a new confirmation before another POST', async () => {
    const mocks = installMocks()
    mocks.createDeposit.mockRejectedValue(
      new ApiError({
        status: 422,
        code: 'WALLET_DEPOSIT_AMOUNT_INVALID',
        message: 'private minimum 123',
      }),
    )
    renderWallet()
    const { dialog, input, user } = await openConfirmation()
    await confirmDeposit(dialog, user)

    expect(
      await screen.findByText('该充值金额当前不可用，请调整金额后重试。'),
    ).toBeInTheDocument()
    expect(input).toHaveValue('100')
    expect(screen.queryByText('private minimum 123')).toBeNull()
    expect(mocks.getList).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, '101')
    await user.click(screen.getByRole('button', { name: '创建充值订单' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.createDeposit).toHaveBeenCalledOnce()
  })

  it('handles a definitive create failure without automatic retry or success claim', async () => {
    const mocks = installMocks()
    mocks.createDeposit.mockRejectedValue(
      new ApiError({
        status: 502,
        code: 'WALLET_DEPOSIT_CREATE_FAILED',
        message: 'private save failure',
      }),
    )
    renderWallet()
    const { dialog, user } = await openConfirmation()
    await confirmDeposit(dialog, user)

    expect(
      await screen.findByText('充值订单未能创建，请重新确认后再试。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('private save failure')).toBeNull()
    expect(screen.queryByText('充值订单已创建')).toBeNull()
    expect(mocks.createDeposit).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '创建充值订单' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mocks.createDeposit).toHaveBeenCalledOnce()
  })
})

describe('Wallet deposit unknown-result recovery', () => {
  it.each([
    ['NETWORK_ERROR', 0],
    ['UPSTREAM_TIMEOUT', 504],
    ['UPSTREAM_ERROR', 502],
    ['MALFORMED_RESPONSE', 200],
  ] as const)(
    'keeps %s unknown, reads Orders without causal inference, and guards a second POST',
    async (code, status) => {
      const mocks = installMocks()
      mocks.createDeposit.mockRejectedValue(
        new ApiError({ status, code, message: 'private unknown detail' }),
      )
      renderWallet()
      const { dialog, user } = await openConfirmation()
      await confirmDeposit(dialog, user)

      expect(
        await screen.findByText('充值订单创建结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          '已重新读取当前订单。请先检查订单列表，避免重复创建。',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText('private unknown detail')).toBeNull()
      expect(screen.queryByText('充值订单已创建')).toBeNull()
      expect(screen.queryByText('充值订单未能创建')).toBeNull()
      expect(screen.queryByText('订单编号：same-looking-order')).toBeNull()
      expect(mocks.createDeposit).toHaveBeenCalledOnce()
      expect(mocks.getList).toHaveBeenCalledOnce()

      const createButton = screen.getByRole('button', {
        name: '创建充值订单',
      })
      expect(createButton).toBeDisabled()
      await user.click(
        screen.getByRole('checkbox', {
          name: '我已检查当前订单列表，确认仍需重新创建充值订单。',
        }),
      )
      expect(createButton).toBeEnabled()
      await user.click(createButton)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(mocks.createDeposit).toHaveBeenCalledOnce()
    },
  )

  it('fails closed when automatic Orders recovery fails until a manual GET succeeds', async () => {
    const mocks = installMocks()
    mocks.createDeposit.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'unknown' }),
    )
    mocks.getList
      .mockRejectedValueOnce(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      )
      .mockResolvedValueOnce([recoveredOrder])
    renderWallet()
    const { dialog, user } = await openConfirmation()
    await confirmDeposit(dialog, user)

    expect(
      await screen.findByText(
        '当前订单暂时无法重新读取。请先重新读取订单，暂时不要再次创建充值订单。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建充值订单' })).toBeDisabled()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(mocks.createDeposit).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '重新读取订单' }))

    expect(
      await screen.findByRole('checkbox', {
        name: '我已检查当前订单列表，确认仍需重新创建充值订单。',
      }),
    ).toBeInTheDocument()
    expect(mocks.getList).toHaveBeenCalledTimes(2)
    expect(mocks.createDeposit).toHaveBeenCalledOnce()
  })
})

describe('Wallet deposit authentication and read boundaries', () => {
  it.each([
    ['deposit', 'AUTH_REQUIRED'],
    ['deposit', 'AUTH_FAILED'],
    ['recovery', 'AUTH_REQUIRED'],
    ['recovery', 'AUTH_FAILED'],
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
      if (source === 'deposit') {
        mocks.createDeposit.mockRejectedValue(authError)
      } else {
        mocks.createDeposit.mockRejectedValue(
          new ApiError({
            status: 0,
            code: 'NETWORK_ERROR',
            message: 'unknown',
          }),
        )
        if (source === 'recovery') {
          mocks.getList.mockRejectedValue(authError)
        } else {
          mocks.getList
            .mockRejectedValueOnce(
              new ApiError({
                status: 0,
                code: 'NETWORK_ERROR',
                message: 'offline',
              }),
            )
            .mockRejectedValueOnce(authError)
        }
      }
      const queryClient = createQueryClient()
      queryClient.setQueryData(['private-state'], { private: true })
      const valid = { current: true }
      const failAuth = async () => {
        valid.current = false
        throw authError
      }
      if (source === 'deposit') mocks.createDeposit.mockImplementation(failAuth)
      else if (source === 'recovery') mocks.getList.mockImplementation(failAuth)
      else
        mocks.getList
          .mockReset()
          .mockRejectedValueOnce(
            new ApiError({
              status: 0,
              code: 'NETWORK_ERROR',
              message: 'offline',
            }),
          )
          .mockImplementation(failAuth)
      const { router } = renderWallet(queryClient, valid)
      const { dialog, user } = await openConfirmation()
      await confirmDeposit(dialog, user)
      if (source === 'manual') {
        await user.click(
          await screen.findByRole('button', { name: '重新读取订单' }),
        )
      }

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
    },
  )

  it('refreshes only the authoritative Wallet balance and keeps the form state', async () => {
    const mocks = installMocks()
    mocks.getWallet
      .mockResolvedValueOnce({ balanceMinor: 12_345 })
      .mockResolvedValueOnce({ balanceMinor: 20_000 })
    renderWallet()
    const user = userEvent.setup()
    const input = await screen.findByRole('textbox', { name: '充值金额' })
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, '100')

    await user.click(screen.getByRole('button', { name: '刷新余额' }))

    expect(await screen.findByText('¥200.00 CNY')).toBeInTheDocument()
    expect(input).toHaveValue('100')
    expect(mocks.getWallet).toHaveBeenCalledTimes(2)
    expect(mocks.createDeposit).not.toHaveBeenCalled()
    expect(mocks.getList).not.toHaveBeenCalled()
    expect(mocks.getMethods).not.toHaveBeenCalled()
    expect(mocks.checkout).not.toHaveBeenCalled()
    expect(mocks.getStatus).not.toHaveBeenCalled()
  })
})
