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
import { authQueryKeys } from '@/features/auth/auth-query-keys'
import {
  financialOperationKeys,
  hasRuntimeFinancialAttempt,
  resetFinancialMutationRuntimeForTests,
} from '@/features/referrals/financial-mutation-runtime'
import { referralsApi } from '@/features/referrals/referrals-api'
import { referralsQueryKeys } from '@/features/referrals/referrals-queries'
import { walletApi } from '@/features/wallet/wallet-api'
import { walletQueryKeys } from '@/features/wallet/wallet-queries'
import { ApiError } from '@/lib/api/errors'
import { sessionSafetyStorageKeys } from '@/lib/auth/session-safety-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

let currentSession: 'a' | 'b' | null = 'a'
let sessionAToken: string | null = null
let sessionBToken: string | null = null
const commissionSafetyKey =
  sessionSafetyStorageKeys.commissionTransferUncertainty
const withdrawalSafetyKey =
  sessionSafetyStorageKeys.withdrawalRequestUncertainty

const overviewA = {
  codes: [{ code: 'SESSIONA', createdAt: '2026-09-14T01:00:00.000Z' }],
  stats: {
    registeredUsers: 1,
    earnedCommissionMinor: 10_000,
    pendingCommissionMinor: 0,
    commissionRatePercent: 10,
    availableCommissionMinor: 10_000,
  },
}
const overviewB = {
  codes: [{ code: 'SESSIONB', createdAt: '2026-09-14T02:00:00.000Z' }],
  stats: {
    registeredUsers: 2,
    earnedCommissionMinor: 20_000,
    pendingCommissionMinor: 100,
    commissionRatePercent: 20,
    availableCommissionMinor: 7_000,
  },
}
const walletA = { balanceMinor: 5_000 }
const walletB = { balanceMinor: 8_000 }
const withdrawalA = { enabled: true, methods: ['bank-a'] }
const withdrawalB = { enabled: true, methods: ['bank-b'] }

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
  return new ApiError({ status, code, message: 'private old-session detail' })
}

function installMocks() {
  const getOverview = vi
    .spyOn(referralsApi, 'getOverview')
    .mockImplementation(async (token) =>
      token === sessionBToken ? overviewB : overviewA,
    )
  const getCommissions = vi
    .spyOn(referralsApi, 'getCommissions')
    .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 })
  const getWithdrawalOptions = vi
    .spyOn(referralsApi, 'getWithdrawalOptions')
    .mockImplementation(async (token) =>
      token === sessionBToken ? withdrawalB : withdrawalA,
    )
  const requestWithdrawal = vi.spyOn(referralsApi, 'requestWithdrawal')
  const transferCommission = vi.spyOn(referralsApi, 'transferCommission')
  const getWallet = vi
    .spyOn(walletApi, 'getWallet')
    .mockImplementation(async (token) =>
      token === sessionBToken ? walletB : walletA,
    )
  vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  return {
    getCommissions,
    getOverview,
    getWallet,
    getWithdrawalOptions,
    requestWithdrawal,
    transferCommission,
  }
}

function createAuthApi(): AuthApi {
  return {
    login: vi.fn().mockImplementation(async () => {
      currentSession = 'b'
      return {
        email: 'session-b@example.com',
        expiresAt: null,
        status: 'active' as const,
        sessionVersion: 'session-b',
      }
    }),
    logout: vi.fn().mockImplementation(async () => {
      currentSession = null
    }),
    getCurrentUser: vi.fn().mockImplementation(async () => {
      if (!currentSession)
        throw new ApiError({
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        })
      return {
        email: `session-${currentSession}@example.com`,
        expiresAt: null,
        status: 'active' as const,
        sessionVersion: `session-${currentSession}`,
      }
    }),
  }
}

function renderSessionA(queryClient: QueryClient = createQueryClient()) {
  currentSession = 'a'
  sessionAToken = null
  sessionBToken = null
  const router = createAppRouter({ initialEntries: ['/referrals'] })
  const rendered = render(
    <AppProviders
      router={router}
      authApi={createAuthApi()}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router, unmount: rendered.unmount }
}

async function logoutSessionA() {
  sessionAToken = useAuthSessionStore.getState().accessToken
  const logout = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === '退出登录',
  )
  if (!logout) throw new Error('Logout button missing')
  fireEvent.click(logout)
  await screen.findByRole('heading', { name: '登录 Aureole' })
}

async function loginSessionB(
  router: ReturnType<typeof createAppRouter>,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.type(screen.getByLabelText('邮箱'), 'session-b@example.com')
  await user.type(screen.getByLabelText('密码'), 'password123')
  await user.click(screen.getByRole('button', { name: '登录' }))
  await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  sessionBToken = useAuthSessionStore.getState().accessToken
  await act(async () => {
    await router.navigate({ to: '/referrals' })
  })
  await screen.findByRole('heading', { name: '提现状态与申请' })
}

async function startWithdrawalA(
  pending: ReturnType<typeof deferred<{ requested: true }>>,
  user: ReturnType<typeof userEvent.setup>,
) {
  const section = (
    await screen.findByRole('heading', { name: '提现状态与申请' })
  ).closest('section')
  if (!section) throw new Error('Withdrawal section missing')
  const scoped = within(section)
  await waitFor(() => expect(scoped.getByLabelText('提现账户')).toBeEnabled())
  await user.selectOptions(scoped.getByLabelText('提现方式'), 'bank-a')
  await user.type(scoped.getByLabelText('提现账户'), 'session-a-account')
  await user.click(scoped.getByRole('button', { name: '提交提现申请' }))
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: '确认提交申请',
    }),
  )
  await waitFor(() => expect(pending.promise).toBeInstanceOf(Promise))
}

async function startCommissionA(
  pending: ReturnType<typeof deferred<{ transferred: true }>>,
  user: ReturnType<typeof userEvent.setup>,
) {
  const section = (
    await screen.findByRole('heading', { name: '佣金划转' })
  ).closest('section')
  if (!section) throw new Error('Commission section missing')
  const scoped = within(section)
  const amount = await scoped.findByRole('textbox', { name: '划转金额' })
  await waitFor(() => expect(amount).toBeEnabled())
  await user.type(amount, '10')
  await user.click(scoped.getByRole('button', { name: '佣金划转' }))
  await user.click(
    within(screen.getByRole('dialog')).getByRole('button', {
      name: '确认划转',
    }),
  )
  await waitFor(() => expect(pending.promise).toBeInstanceOf(Promise))
}

function countTokenCalls(
  mock: { mock: { calls: unknown[][] } },
  token: string | null,
) {
  return mock.mock.calls.filter(([calledToken]) => calledToken === token).length
}

const withdrawalSettlements = [
  {
    name: 'success',
    settle: (pending: ReturnType<typeof deferred<{ requested: true }>>) =>
      pending.resolve({ requested: true }),
  },
  {
    name: 'definitive',
    settle: (pending: ReturnType<typeof deferred<{ requested: true }>>) =>
      pending.reject(apiError('VALIDATION_ERROR', 400)),
  },
  {
    name: 'UNKNOWN',
    settle: (pending: ReturnType<typeof deferred<{ requested: true }>>) =>
      pending.reject(apiError('NETWORK_ERROR', 0)),
  },
  {
    name: 'AUTH_FAILED',
    settle: (pending: ReturnType<typeof deferred<{ requested: true }>>) =>
      pending.reject(apiError('AUTH_FAILED', 401)),
  },
]

describe('Withdrawal cross-session continuation isolation', () => {
  it.each(withdrawalSettlements)(
    'keeps Session B isolated when old Session A settles $name',
    async ({ settle }) => {
      const mocks = installMocks()
      const pending = deferred<{ requested: true }>()
      mocks.requestWithdrawal.mockReturnValue(pending.promise)
      const { queryClient, router } = renderSessionA()
      const user = userEvent.setup()
      await startWithdrawalA(pending, user)
      await waitFor(() =>
        expect(mocks.requestWithdrawal).toHaveBeenCalledOnce(),
      )

      await logoutSessionA()
      expect(
        queryClient.getMutationCache().findAll({
          mutationKey: ['referrals', 'withdrawal-request'],
          exact: true,
          status: 'pending',
        }),
      ).toHaveLength(0)
      expect(
        hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest),
      ).toBe(true)
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')

      await loginSessionB(router, user)
      await screen.findByText(
        '上一笔提现申请仍在处理中，请等待结果，暂不能再次提交。',
      )
      expect(screen.queryByRole('checkbox')).toBeNull()
      await waitFor(() =>
        expect(
          queryClient.getQueryData(referralsQueryKeys.withdrawalOptions),
        ).toEqual(withdrawalB),
      )
      const oldReadsBefore = countTokenCalls(
        mocks.getWithdrawalOptions,
        sessionAToken,
      )

      act(() => settle(pending))
      await waitFor(() =>
        expect(
          hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest),
        ).toBe(false),
      )

      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
      expect(useAuthSessionStore.getState().accessToken).toBe(sessionBToken)
      expect(useAuthSessionStore.getState().accessToken).not.toBe(sessionAToken)
      expect(queryClient.getQueryData(authQueryKeys.me)).toMatchObject({
        email: 'session-b@example.com',
      })
      expect(
        queryClient.getQueryData(referralsQueryKeys.withdrawalOptions),
      ).toEqual(withdrawalB)
      expect(countTokenCalls(mocks.getWithdrawalOptions, sessionAToken)).toBe(
        oldReadsBefore,
      )
      expect(screen.queryByText('提现申请已提交。')).toBeNull()
      const acknowledgement = await screen.findByRole('checkbox', {
        name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
      })
      expect(acknowledgement).toBeEnabled()
    },
  )
})

const commissionSettlements = [
  {
    name: 'success',
    settle: (pending: ReturnType<typeof deferred<{ transferred: true }>>) =>
      pending.resolve({ transferred: true }),
  },
  {
    name: 'definitive',
    settle: (pending: ReturnType<typeof deferred<{ transferred: true }>>) =>
      pending.reject(apiError('INSUFFICIENT_COMMISSION_BALANCE', 409)),
  },
  {
    name: 'UNKNOWN',
    settle: (pending: ReturnType<typeof deferred<{ transferred: true }>>) =>
      pending.reject(apiError('NETWORK_ERROR', 0)),
  },
  {
    name: 'AUTH_FAILED',
    settle: (pending: ReturnType<typeof deferred<{ transferred: true }>>) =>
      pending.reject(apiError('AUTH_FAILED', 401)),
  },
]

describe('Commission cross-session continuation isolation', () => {
  it.each(commissionSettlements)(
    'keeps Session B isolated when old Session A settles $name',
    async ({ settle }) => {
      const mocks = installMocks()
      const pending = deferred<{ transferred: true }>()
      mocks.transferCommission.mockReturnValue(pending.promise)
      const { queryClient, router } = renderSessionA()
      const user = userEvent.setup()
      await startCommissionA(pending, user)
      await waitFor(() =>
        expect(mocks.transferCommission).toHaveBeenCalledOnce(),
      )

      await logoutSessionA()
      expect(
        queryClient.getMutationCache().findAll({
          mutationKey: ['referrals', 'commission-transfer'],
          exact: true,
          status: 'pending',
        }),
      ).toHaveLength(0)
      expect(
        hasRuntimeFinancialAttempt(financialOperationKeys.commissionTransfer),
      ).toBe(true)
      expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')

      await loginSessionB(router, user)
      await screen.findByText(
        '上一笔佣金划转仍在处理中，请等待结果，暂不能再次划转。',
      )
      expect(
        screen.queryByRole('checkbox', {
          name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
        }),
      ).toBeNull()
      await waitFor(() => {
        expect(queryClient.getQueryData(referralsQueryKeys.overview)).toEqual(
          overviewB,
        )
        expect(queryClient.getQueryData(walletQueryKeys.wallet)).toEqual(
          walletB,
        )
      })
      const oldOverviewReadsBefore = countTokenCalls(
        mocks.getOverview,
        sessionAToken,
      )
      const oldWalletReadsBefore = countTokenCalls(
        mocks.getWallet,
        sessionAToken,
      )

      act(() => settle(pending))
      await waitFor(() =>
        expect(
          hasRuntimeFinancialAttempt(financialOperationKeys.commissionTransfer),
        ).toBe(false),
      )

      expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
      expect(useAuthSessionStore.getState().accessToken).toBe(sessionBToken)
      expect(useAuthSessionStore.getState().accessToken).not.toBe(sessionAToken)
      expect(queryClient.getQueryData(authQueryKeys.me)).toMatchObject({
        email: 'session-b@example.com',
      })
      expect(queryClient.getQueryData(referralsQueryKeys.overview)).toEqual(
        overviewB,
      )
      expect(queryClient.getQueryData(walletQueryKeys.wallet)).toEqual(walletB)
      expect(countTokenCalls(mocks.getOverview, sessionAToken)).toBe(
        oldOverviewReadsBefore,
      )
      expect(countTokenCalls(mocks.getWallet, sessionAToken)).toBe(
        oldWalletReadsBefore,
      )
      expect(screen.queryByText('佣金划转已确认。')).toBeNull()
      const acknowledgement = await screen.findByRole('checkbox', {
        name: '我已核对当前可用佣金和账户余额，仍需再次提交佣金划转。',
      })
      expect(acknowledgement).toBeEnabled()
    },
  )
})

describe('Financial uncertainty after logout and full runtime replacement', () => {
  it('keeps active Withdrawal uncertainty when the runtime registry disappears', async () => {
    const mocks = installMocks()
    const pending = deferred<{ requested: true }>()
    mocks.requestWithdrawal.mockReturnValue(pending.promise)
    const first = renderSessionA()
    const user = userEvent.setup()
    await startWithdrawalA(pending, user)
    await waitFor(() => expect(mocks.requestWithdrawal).toHaveBeenCalledOnce())
    await logoutSessionA()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    first.unmount()

    resetFinancialMutationRuntimeForTests()
    useAuthSessionStore.setState({
      accessToken: null,
      generation: 0,
      hydrated: false,
      validated: false,
    })
    const nextQueryClient = createQueryClient()
    const nextRouter = createAppRouter({ initialEntries: ['/login'] })
    render(
      <AppProviders
        router={nextRouter}
        authApi={createAuthApi()}
        queryClient={nextQueryClient}
      />,
    )
    const nextUser = userEvent.setup()
    await screen.findByRole('heading', { name: '登录 Aureole' })
    await loginSessionB(nextRouter, nextUser)

    expect(
      hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest),
    ).toBe(false)
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    const account = screen.getByLabelText('提现账户')
    expect(account).toHaveValue('')
    expect(account).toBeDisabled()
    expect(
      screen.getByRole('checkbox', {
        name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
      }),
    ).toBeInTheDocument()
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
  })
})
