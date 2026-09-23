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
import { commissionTransferLocalGuardKeys } from '@/features/referrals/commission-transfer-guard'
import { referralCreateLocalGuardKeys } from '@/features/referrals/referral-create-guard'
import { referralsApi } from '@/features/referrals/referrals-api'
import { referralsQueryKeys } from '@/features/referrals/referrals-queries'
import { withdrawalRequestLocalGuardKeys } from '@/features/referrals/withdrawal-request-guard'
import {
  financialOperationKeys,
  hasRuntimeFinancialAttempt,
  resetFinancialMutationRuntimeForTests,
} from '@/features/referrals/financial-mutation-runtime'
import { walletApi } from '@/features/wallet/wallet-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'
import { sessionSafetyStorageKeys } from '@/lib/auth/session-safety-storage'
import { useAuthSessionStore } from '@/lib/auth/session-store'

const withdrawalSafetyKey =
  sessionSafetyStorageKeys.withdrawalRequestUncertainty
const commissionSafetyKey =
  sessionSafetyStorageKeys.commissionTransferUncertainty
const rawAccount = '  Mixed.Case+Account  '
const methodOne = 'bank_wire'
const methodTwo = 'wallet-id'
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
  const getCommissions = vi
    .spyOn(referralsApi, 'getCommissions')
    .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 })
  const getWithdrawalOptions = vi
    .spyOn(referralsApi, 'getWithdrawalOptions')
    .mockResolvedValue({ enabled: true, methods: [methodOne, methodTwo] })
  const requestWithdrawal = vi
    .spyOn(referralsApi, 'requestWithdrawal')
    .mockResolvedValue({ requested: true })
  const transferCommission = vi
    .spyOn(referralsApi, 'transferCommission')
    .mockResolvedValue({ transferred: true })
  const getWallet = vi
    .spyOn(walletApi, 'getWallet')
    .mockResolvedValue({ balanceMinor: 5_000 })
  const getConfig = vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  return {
    getCommissions,
    getConfig,
    getOverview,
    getWallet,
    getWithdrawalOptions,
    requestWithdrawal,
    transferCommission,
  }
}

function authApi(session: { current: boolean }): AuthApi {
  return {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockImplementation(() =>
      session.current
        ? Promise.resolve({
            email: 'member@example.com',
            expiresAt: null,
            status: 'active',
          })
        : Promise.reject(apiError('AUTH_REQUIRED', 401)),
    ),
    logout: vi.fn().mockImplementation(async () => {
      session.current = false
    }),
  }
}

function renderReferrals(
  queryClient: QueryClient = createQueryClient(),
  session = { current: true },
) {
  const router = createAppRouter({ initialEntries: ['/referrals'] })
  const rendered = render(
    <AppProviders
      router={router}
      authApi={authApi(session)}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router, session, unmount: rendered.unmount }
}

function renderFullRuntime(queryClient: QueryClient = createQueryClient()) {
  resetFinancialMutationRuntimeForTests()
  useAuthSessionStore.setState({
    accessToken: null,
    generation: 0,
    hydrated: false,
  })
  const router = createAppRouter({ initialEntries: ['/referrals'] })
  const session = { current: true }
  const rendered = render(
    <AppProviders
      router={router}
      authApi={authApi(session)}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router, session, unmount: rendered.unmount }
}

async function withdrawalSection() {
  const section = (
    await screen.findByRole('heading', { name: '提现状态与申请' })
  ).closest('section')
  if (!section) throw new Error('Withdrawal section missing')
  return within(section)
}

async function openConfirmation(
  account = rawAccount,
  method = methodOne,
  user = userEvent.setup(),
) {
  const section = await withdrawalSection()
  const select = await section.findByLabelText('提现方式')
  const input = section.getByLabelText('提现账户')
  await waitFor(() => expect(select).toBeEnabled())
  await user.selectOptions(select, method)
  await user.clear(input)
  await user.type(input, account)
  await user.click(section.getByRole('button', { name: '提交提现申请' }))
  return {
    dialog: screen.getByRole('dialog'),
    input,
    section,
    select,
    user,
  }
}

async function confirmWithdrawal(
  form: Awaited<ReturnType<typeof openConfirmation>>,
) {
  await form.user.click(
    within(form.dialog).getByRole('button', { name: '确认提交申请' }),
  )
}

async function navigateAwayAndBack(
  router: ReturnType<typeof createAppRouter>,
  heading: '提现状态与申请' | '佣金划转',
) {
  await act(async () => {
    await router.navigate({ to: '/dashboard' })
  })
  await waitFor(() =>
    expect(screen.queryByRole('heading', { name: heading })).toBeNull(),
  )
  await act(async () => {
    await router.navigate({ to: '/referrals' })
  })
}

describe('Withdrawal Request authority and confirmation', () => {
  it('keeps disabled and empty Options read-only with no request form', async () => {
    const mocks = installMocks()
    mocks.getWithdrawalOptions.mockResolvedValueOnce({
      enabled: false,
      methods: [],
    })
    const first = renderReferrals()
    expect(await screen.findByText('当前暂未开放提现。')).toBeInTheDocument()
    expect(screen.queryByLabelText('提现账户')).toBeNull()
    expect(screen.queryByRole('button', { name: '提交提现申请' })).toBeNull()
    first.unmount()

    mocks.getWithdrawalOptions.mockResolvedValueOnce({
      enabled: true,
      methods: [],
    })
    renderReferrals()
    expect(await screen.findByText('当前未提供提现方式。')).toBeInTheDocument()
    expect(screen.queryByLabelText('提现账户')).toBeNull()
  })

  it('preserves server method order and raw account through explicit confirmation', async () => {
    const mocks = installMocks()
    renderReferrals()
    const form = await openConfirmation()
    const select = form.select as HTMLSelectElement

    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '',
      methodOne,
      methodTwo,
    ])
    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
    expect(within(form.dialog).getByText(methodOne)).toBeInTheDocument()
    expect(within(form.dialog).queryByText(rawAccount)).toBeNull()
    expect(
      within(form.dialog).getByRole('button', {
        name: '显示确认中的提现账户',
      }),
    ).toBeInTheDocument()
    for (const forbidden of [
      '提现金额',
      '预计到账金额',
      '手续费',
      '预计到账时间',
      '最低提现额',
    ]) {
      expect(within(form.dialog).queryByText(forbidden)).toBeNull()
    }

    await form.user.click(
      within(form.dialog).getByRole('button', {
        name: '显示确认中的提现账户',
      }),
    )
    expect(
      within(form.dialog).getByText(
        (_content, element) =>
          element?.tagName === 'DD' && element.textContent === rawAccount,
      ),
    ).toBeInTheDocument()
    await form.user.click(
      within(form.dialog).getByRole('button', { name: '返回' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(form.input).toHaveValue(rawAccount)
    expect(form.input).toHaveAttribute('type', 'password')
    expect(
      form.section.getByRole('button', { name: '提交提现申请' }),
    ).toHaveFocus()

    await form.user.click(
      form.section.getByRole('button', { name: '提交提现申请' }),
    )
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '显示确认中的提现账户',
      }),
    ).toBeInTheDocument()
  })

  it('validates method and account locally without altering account text', async () => {
    const mocks = installMocks()
    renderReferrals()
    const section = await withdrawalSection()
    const user = userEvent.setup()
    const input = await section.findByLabelText('提现账户')

    await user.type(input, ' ')
    await user.click(section.getByRole('button', { name: '提交提现申请' }))
    expect(
      await section.findByText('请选择当前服务端提供的提现方式。'),
    ).toBeInTheDocument()
    expect(input).toHaveValue(' ')
    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()

    await user.selectOptions(section.getByLabelText('提现方式'), methodOne)
    await user.clear(input)
    await user.click(section.getByRole('button', { name: '提交提现申请' }))
    expect(
      await section.findByText('请输入 1 至 1024 个字符的提现账户。'),
    ).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'a'.repeat(1025) } })
    await user.click(section.getByRole('button', { name: '提交提现申请' }))
    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
  })

  it('keeps the form unavailable while cached Options are refetching', async () => {
    const mocks = installMocks()
    const pendingOptions = deferred<{ enabled: true; methods: string[] }>()
    const queryClient = createQueryClient()
    renderReferrals(queryClient)
    await waitFor(() =>
      expect(useAuthSessionStore.getState().validated).toBe(true),
    )
    queryClient.setQueryData(referralsQueryKeys.withdrawalOptions, {
      enabled: true,
      methods: [methodOne],
    })
    mocks.getWithdrawalOptions.mockReturnValue(pendingOptions.promise)
    void queryClient.refetchQueries({
      queryKey: referralsQueryKeys.withdrawalOptions,
      exact: true,
    })
    const section = await withdrawalSection()

    expect(section.queryByLabelText('提现账户')).toBeNull()
    expect(section.getByText('正在重新读取当前提现状态…')).toBeInTheDocument()
    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
  })

  it('blocks same-tick Confirm when Options refetch starts before React rerenders', async () => {
    const mocks = installMocks()
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    const pendingOptions = deferred<{ enabled: true; methods: string[] }>()
    act(() => {
      void queryClient.fetchQuery({
        queryKey: referralsQueryKeys.withdrawalOptions,
        queryFn: () => pendingOptions.promise,
        staleTime: 0,
      })
      fireEvent.click(
        within(form.dialog).getByRole('button', { name: '确认提交申请' }),
      )
    })

    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen.getByText('当前提现状态已变化，请完成重新读取后重新确认。'),
      ).toBeInTheDocument(),
    )
    act(() => pendingOptions.resolve({ enabled: true, methods: [methodOne] }))
  })

  it('rejects a confirmation whose exact method disappeared', async () => {
    const mocks = installMocks()
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    act(() => {
      queryClient.setQueryData(referralsQueryKeys.withdrawalOptions, {
        enabled: true,
        methods: [methodTwo],
      })
    })
    fireEvent.click(
      within(form.dialog).getByRole('button', { name: '确认提交申请' }),
    )

    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
    await waitFor(() => expect(form.select).toHaveValue(''))
  })

  it('pre-arms and locks same-tick double Confirm to one POST', async () => {
    const mocks = installMocks()
    const pendingRequest = deferred<{ requested: true }>()
    mocks.requestWithdrawal.mockImplementation(() => {
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
      return pendingRequest.promise
    })
    renderReferrals()
    const form = await openConfirmation()
    const confirm = within(form.dialog).getByRole('button', {
      name: '确认提交申请',
    })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(mocks.requestWithdrawal).toHaveBeenCalledOnce())
    expect(mocks.requestWithdrawal).toHaveBeenCalledWith(expect.any(String), {
      method: methodOne,
      account: rawAccount,
    })
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    await form.user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => pendingRequest.resolve({ requested: true }))
    expect(await screen.findByText('提现申请已提交。')).toBeInTheDocument()
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBeNull()
  })
})

describe('Withdrawal Request outcomes and exact reconciliation', () => {
  it('releases the runtime attempt only after Options reconciliation completes', async () => {
    const mocks = installMocks()
    const recovery = deferred<{ enabled: true; methods: string[] }>()
    mocks.getWithdrawalOptions
      .mockResolvedValueOnce({ enabled: true, methods: [methodOne] })
      .mockReturnValueOnce(recovery.promise)
    renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)

    await waitFor(() => expect(mocks.requestWithdrawal).toHaveBeenCalledOnce())
    expect(
      hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest),
    ).toBe(true)
    expect(
      await screen.findByText(
        '上一笔提现申请仍在处理中，请等待结果，暂不能再次提交。',
      ),
    ).toBeInTheDocument()

    act(() => recovery.resolve({ enabled: true, methods: [methodOne] }))
    await waitFor(() =>
      expect(
        hasRuntimeFinancialAttempt(financialOperationKeys.withdrawalRequest),
      ).toBe(false),
    )
    expect(await screen.findByText('提现申请已提交。')).toBeInTheDocument()
  })

  it('keeps success semantics narrow and refetches only Withdrawal Options', async () => {
    const mocks = installMocks()
    renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)

    expect(await screen.findByText('提现申请已提交。')).toBeInTheDocument()
    expect(
      screen.queryByText(/提现成功|提现已到账|资金已转出|已完成打款/),
    ).toBeNull()
    expect(form.input).toHaveValue('')
    expect(form.select).toHaveValue('')
    expect(mocks.getWithdrawalOptions).toHaveBeenCalledTimes(2)
    expect(mocks.getOverview).toHaveBeenCalledOnce()
    expect(mocks.getCommissions).toHaveBeenCalledOnce()
    expect(mocks.getWallet).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBeNull()
  })

  it('preserves confirmed success when Options reconciliation fails and recovers GET-only', async () => {
    const mocks = installMocks()
    mocks.getWithdrawalOptions
      .mockResolvedValueOnce({ enabled: true, methods: [methodOne] })
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
    renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)

    expect(
      await screen.findByText(
        '申请已提交，但暂时无法读取最新提现状态。下一笔申请已停用。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
    const section = await withdrawalSection()
    mocks.getWithdrawalOptions.mockResolvedValue({
      enabled: true,
      methods: [methodOne],
    })
    await form.user.click(
      section.getByRole('button', { name: '重新读取提现状态' }),
    )
    await waitFor(() =>
      expect(section.getByLabelText('提现账户')).toBeEnabled(),
    )
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
  })

  it.each([
    ['WITHDRAWAL_DISABLED', 409, '当前服务端不开放提现申请。'],
    ['WITHDRAWAL_METHOD_UNSUPPORTED', 422, '当前选择的提现方式已不可用。'],
    ['WITHDRAWAL_MINIMUM_NOT_MET', 409, '当前未达到系统提现要求。'],
    ['WITHDRAWAL_REQUEST_FAILED', 502, '暂时无法提交提现申请。'],
    ['VALIDATION_ERROR', 400, '当前提现申请内容无效，请重新填写并确认。'],
  ] as const)(
    'handles %s as a definitive rejection',
    async (code, status, message) => {
      const mocks = installMocks()
      mocks.requestWithdrawal.mockRejectedValue(apiError(code, status))
      renderReferrals()
      const form = await openConfirmation()
      await confirmWithdrawal(form)

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(screen.queryByText('private upstream detail')).toBeNull()
      expect(screen.queryByText(/工单|Ticket|提现成功|提现失败/)).toBeNull()
      expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
      expect(mocks.getWithdrawalOptions).toHaveBeenCalledTimes(2)
      expect(mocks.getOverview).toHaveBeenCalledOnce()
      expect(mocks.getCommissions).toHaveBeenCalledOnce()
      expect(form.input).toHaveValue('')
      expect(form.select).toHaveValue('')
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBeNull()
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )
})

describe('Withdrawal Request UNKNOWN safety', () => {
  it.each([
    ['NETWORK_ERROR', apiError('NETWORK_ERROR', 0)],
    ['UPSTREAM_TIMEOUT', apiError('UPSTREAM_TIMEOUT', 504)],
    ['UPSTREAM_ERROR', apiError('UPSTREAM_ERROR')],
    ['MALFORMED_RESPONSE', apiError('MALFORMED_RESPONSE', 200)],
    ['unexpected Public error', apiError('UNEXPECTED_PUBLIC_ERROR', 418)],
    ['plain Error', new Error('private exception')],
  ])('keeps %s UNKNOWN after Options recovery', async (_name, error) => {
    const mocks = installMocks()
    mocks.requestWithdrawal.mockRejectedValue(error)
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)

    expect(
      await screen.findByText(
        '上一笔提现申请结果暂时无法确认。请避免重复提交。',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '已重新读取当前提现状态，但无法据此确认上一笔申请结果。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/提现成功|提现失败|未提交|已到账/)).toBeNull()
    expect(form.input).toHaveValue('')
    expect(form.select).toHaveValue('')
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
    expect(mocks.getWithdrawalOptions).toHaveBeenCalledTimes(2)
    expect(mocks.getOverview).toHaveBeenCalledOnce()
    expect(mocks.getCommissions).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(
      queryClient.getQueryData(withdrawalRequestLocalGuardKeys.uncertainty),
    ).toBe('active')
    const mutationState = JSON.stringify(
      queryClient
        .getMutationCache()
        .findAll({ mutationKey: ['referrals', 'withdrawal-request'] }),
    )
    expect(mutationState).not.toContain(rawAccount)
  })

  it.each([
    ['disabled', { enabled: false, methods: [] }],
    ['method removed', { enabled: true, methods: [methodTwo] }],
  ] as const)(
    'does not infer outcome when recovered Options are %s',
    async (_name, recoveredOptions) => {
      const mocks = installMocks()
      mocks.requestWithdrawal.mockRejectedValue(apiError('NETWORK_ERROR', 0))
      mocks.getWithdrawalOptions
        .mockResolvedValueOnce({ enabled: true, methods: [methodOne] })
        .mockResolvedValueOnce({
          enabled: recoveredOptions.enabled,
          methods: [...recoveredOptions.methods],
        })
      const { queryClient } = renderReferrals()
      const form = await openConfirmation()
      act(() => {
        queryClient.setQueryData(referralsQueryKeys.overview, {
          ...overview,
          stats: { ...overview.stats, availableCommissionMinor: 1 },
        })
      })
      await confirmWithdrawal(form)

      expect(
        await screen.findByText(
          '上一笔提现申请结果暂时无法确认。请避免重复提交。',
        ),
      ).toBeInTheDocument()
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
      expect(mocks.getOverview).toHaveBeenCalledOnce()
      expect(mocks.getWithdrawalOptions).toHaveBeenCalledTimes(2)
      expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
    },
  )

  it('requires Options recovery, acknowledgement, new input, and a new confirmation', async () => {
    const mocks = installMocks()
    mocks.requestWithdrawal
      .mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
      .mockResolvedValueOnce({ requested: true })
    mocks.getWithdrawalOptions
      .mockResolvedValueOnce({ enabled: true, methods: [methodOne] })
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
    renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)

    const section = await withdrawalSection()
    expect(section.queryByRole('checkbox')).toBeNull()
    mocks.getWithdrawalOptions.mockResolvedValue({
      enabled: true,
      methods: [methodOne],
    })
    await form.user.click(
      section.getByRole('button', { name: '重新读取提现状态' }),
    )
    const acknowledgement = await section.findByRole('checkbox', {
      name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
    })
    await form.user.click(acknowledgement)
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe(
      'acknowledged',
    )
    await form.user.selectOptions(section.getByLabelText('提现方式'), methodOne)
    await form.user.type(section.getByLabelText('提现账户'), 'next-account')
    await form.user.click(section.getByRole('button', { name: '提交提现申请' }))
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
    await form.user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '确认提交申请',
      }),
    )
    expect(await screen.findByText('提现申请已提交。')).toBeInTheDocument()
    expect(mocks.requestWithdrawal).toHaveBeenCalledTimes(2)
  })
})

describe('Withdrawal Request full-runtime and session safety', () => {
  it('hydrates handled UNKNOWN into a brand-new QueryClient runtime', async () => {
    const mocks = installMocks()
    mocks.requestWithdrawal.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    const first = renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)
    await screen.findByRole('checkbox', {
      name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
    })
    first.unmount()

    const nextQueryClient = createQueryClient()
    renderFullRuntime(nextQueryClient)
    const section = await withdrawalSection()
    expect(
      await section.findByRole('checkbox', {
        name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
      }),
    ).toBeInTheDocument()
    expect(section.getByLabelText('提现账户')).toHaveValue('')
    expect(section.getByLabelText('提现账户')).toBeDisabled()
    expect(
      nextQueryClient.getQueryData(withdrawalRequestLocalGuardKeys.uncertainty),
    ).toBe('active')
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
  })

  it('survives an in-flight reload before the old Promise settles', async () => {
    const mocks = installMocks()
    const pendingRequest = deferred<{ requested: true }>()
    mocks.requestWithdrawal.mockImplementation(() => pendingRequest.promise)
    const first = renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)
    await waitFor(() => expect(mocks.requestWithdrawal).toHaveBeenCalledOnce())
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    first.unmount()

    renderFullRuntime(createQueryClient())
    const section = await withdrawalSection()
    expect(
      await section.findByRole('checkbox', {
        name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
      }),
    ).toBeInTheDocument()
    expect(section.getByLabelText('提现账户')).toBeDisabled()
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
  })

  it('restores acknowledged state as a fresh empty form and pre-arms again', async () => {
    const mocks = installMocks()
    mocks.requestWithdrawal.mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
    const first = renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)
    const acknowledgement = await screen.findByRole('checkbox', {
      name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
    })
    await form.user.click(acknowledgement)
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe(
      'acknowledged',
    )
    first.unmount()

    const pendingRequest = deferred<{ requested: true }>()
    mocks.requestWithdrawal.mockImplementationOnce(() => {
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
      return pendingRequest.promise
    })
    renderFullRuntime(createQueryClient())
    const section = await withdrawalSection()
    const input = await section.findByLabelText('提现账户')
    await waitFor(() => expect(input).toBeEnabled())
    expect(input).toHaveValue('')
    expect(section.queryByRole('checkbox')).toBeNull()
    await form.user.selectOptions(section.getByLabelText('提现方式'), methodOne)
    await form.user.type(input, 'fresh-account')
    await form.user.click(section.getByRole('button', { name: '提交提现申请' }))
    await form.user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '确认提交申请',
      }),
    )
    await waitFor(() =>
      expect(mocks.requestWithdrawal).toHaveBeenCalledTimes(2),
    )
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
  })

  it.each([
    ['success', null],
    ['definitive rejection', apiError('WITHDRAWAL_DISABLED', 409)],
  ] as const)(
    'does not hydrate a stale marker after %s',
    async (_name, error) => {
      const mocks = installMocks()
      if (error) mocks.requestWithdrawal.mockRejectedValue(error)
      const first = renderReferrals()
      const form = await openConfirmation()
      await confirmWithdrawal(form)
      await waitFor(() =>
        expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBeNull(),
      )
      first.unmount()

      const nextQueryClient = createQueryClient()
      renderFullRuntime(nextQueryClient)
      const section = await withdrawalSection()
      await waitFor(() =>
        expect(section.getByLabelText('提现账户')).toBeEnabled(),
      )
      expect(
        nextQueryClient.getQueryData(
          withdrawalRequestLocalGuardKeys.uncertainty,
        ),
      ).toBeNull()
    },
  )

  it('preserves active and downgrades acknowledged markers on logout', async () => {
    installMocks()
    window.sessionStorage.setItem(withdrawalSafetyKey, 'active')
    window.sessionStorage.setItem(commissionSafetyKey, 'acknowledged')
    const queryClient = createQueryClient()
    renderReferrals(queryClient)
    await waitFor(() =>
      expect(useAuthSessionStore.getState().validated).toBe(true),
    )
    queryClient.setQueryData(referralCreateLocalGuardKeys.uncertainty, 'active')

    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: '退出登录' }))
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).toBeUndefined()
  })

  it('keeps Withdrawal and Commission guards isolated during UNKNOWN', async () => {
    const mocks = installMocks()
    mocks.requestWithdrawal.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    window.sessionStorage.setItem(commissionSafetyKey, 'acknowledged')
    const queryClient = createQueryClient()
    renderReferrals(queryClient)
    await waitFor(() =>
      expect(useAuthSessionStore.getState().validated).toBe(true),
    )
    queryClient.setQueryData(referralCreateLocalGuardKeys.uncertainty, 'active')
    const form = await openConfirmation()
    await confirmWithdrawal(form)

    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe(
      'acknowledged',
    )
    expect(
      queryClient.getQueryData(commissionTransferLocalGuardKeys.uncertainty),
    ).toBe('acknowledged')
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).toBe('active')
  })
})

describe('Withdrawal Request same-runtime pending safety', () => {
  it('blocks acknowledgement and a second attempt after SPA remount while Attempt A is pending', async () => {
    const mocks = installMocks()
    const pendingRequest = deferred<{ requested: true }>()
    mocks.requestWithdrawal.mockReturnValue(pendingRequest.promise)
    const queryClient = createQueryClient()
    const { router } = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmWithdrawal(form)
    await waitFor(() => expect(mocks.requestWithdrawal).toHaveBeenCalledOnce())
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')

    await navigateAwayAndBack(router, '提现状态与申请')
    const section = await withdrawalSection()
    await section.findByText(
      '上一笔提现申请仍在处理中，请等待结果，暂不能再次提交。',
    )
    expect(
      section.queryByRole('checkbox', {
        name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
      }),
    ).toBeNull()
    expect(section.getByLabelText('提现账户')).toBeDisabled()
    const transferSectionElement = (
      await screen.findByRole('heading', { name: '佣金划转' })
    ).closest('section')
    expect(transferSectionElement).not.toBeNull()
    await waitFor(() =>
      expect(
        within(transferSectionElement as HTMLElement).getByRole('textbox', {
          name: '划转金额',
        }),
      ).toBeEnabled(),
    )
    expect(
      queryClient.getMutationCache().findAll({
        mutationKey: ['referrals', 'withdrawal-request'],
        exact: true,
        status: 'pending',
      }),
    ).toHaveLength(1)
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
  })

  it.each([
    [
      'success',
      { type: 'resolve' as const, value: { requested: true as const } },
    ],
    [
      'definitive rejection',
      {
        type: 'reject' as const,
        value: apiError('VALIDATION_ERROR', 400),
      },
    ],
  ])(
    'reopens only after old Attempt A %s settles and Options reconcile',
    async (_name, settlement) => {
      const mocks = installMocks()
      const pendingRequest = deferred<{ requested: true }>()
      mocks.requestWithdrawal.mockReturnValue(pendingRequest.promise)
      const { router } = renderReferrals()
      const form = await openConfirmation()
      await confirmWithdrawal(form)
      await waitFor(() =>
        expect(mocks.requestWithdrawal).toHaveBeenCalledOnce(),
      )

      await navigateAwayAndBack(router, '提现状态与申请')
      const section = await withdrawalSection()
      await section.findByText(
        '上一笔提现申请仍在处理中，请等待结果，暂不能再次提交。',
      )
      if (settlement.type === 'resolve') {
        act(() => pendingRequest.resolve(settlement.value))
      } else {
        act(() => pendingRequest.reject(settlement.value))
      }

      await waitFor(() =>
        expect(section.getByLabelText('提现账户')).toBeEnabled(),
      )
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBeNull()
      expect(mocks.getWithdrawalOptions).toHaveBeenCalledTimes(3)
      expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
    },
  )

  it('exposes acknowledgement only after old Attempt A settles UNKNOWN and Options recover', async () => {
    const mocks = installMocks()
    const pendingRequest = deferred<{ requested: true }>()
    mocks.requestWithdrawal.mockReturnValue(pendingRequest.promise)
    const { router } = renderReferrals()
    const form = await openConfirmation()
    await confirmWithdrawal(form)
    await waitFor(() => expect(mocks.requestWithdrawal).toHaveBeenCalledOnce())

    await navigateAwayAndBack(router, '提现状态与申请')
    const section = await withdrawalSection()
    expect(section.queryByRole('checkbox')).toBeNull()
    act(() => pendingRequest.reject(apiError('NETWORK_ERROR', 0)))

    const acknowledgement = await section.findByRole('checkbox', {
      name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
    })
    expect(acknowledgement).toBeEnabled()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(mocks.getWithdrawalOptions).toHaveBeenCalledTimes(3)
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
  })

  it('blocks Confirm through the direct MutationCache gate before pending UI renders', async () => {
    const mocks = installMocks()
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    const blocker = deferred<never>()
    const cachedMutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['referrals', 'withdrawal-request'],
      mutationFn: () => blocker.promise,
      retry: false,
    })

    act(() => {
      void cachedMutation.execute(undefined)
      fireEvent.click(
        within(form.dialog).getByRole('button', { name: '确认提交申请' }),
      )
    })

    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      await screen.findByText(
        '上一笔提现申请仍在处理中，请等待结果，暂不能再次提交。',
      ),
    ).toBeInTheDocument()
  })

  it('blocks a same-tick acknowledgement when the exact mutation becomes pending', async () => {
    installMocks()
    window.sessionStorage.setItem(withdrawalSafetyKey, 'active')
    const queryClient = createQueryClient()
    renderReferrals(queryClient)
    const acknowledgement = await screen.findByRole('checkbox', {
      name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
    })
    const blocker = deferred<never>()
    const cachedMutation = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ['referrals', 'withdrawal-request'],
      mutationFn: () => blocker.promise,
      retry: false,
    })

    act(() => {
      void cachedMutation.execute(undefined)
      fireEvent.click(acknowledgement)
    })

    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(
      queryClient.getQueryData(withdrawalRequestLocalGuardKeys.uncertainty),
    ).toBe('active')
    expect(
      await screen.findByText(
        '上一笔提现申请仍在处理中，请等待结果，暂不能再次提交。',
      ),
    ).toBeInTheDocument()
  })
})

describe('Withdrawal Request storage and Auth failure handling', () => {
  it('fails closed with zero POST when pre-arm persistence fails, then recovers', async () => {
    const mocks = installMocks()
    renderReferrals()
    const form = await openConfirmation()
    const originalSetItem = Storage.prototype.setItem
    const storageSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (this: Storage, key, value) {
        if (this === window.sessionStorage && key === withdrawalSafetyKey) {
          throw new DOMException('private storage detail', 'SecurityError')
        }
        return originalSetItem.call(this, key, value)
      })

    await confirmWithdrawal(form)
    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
    expect(
      await screen.findByText(
        '当前无法建立提现申请安全状态，请稍后重试或检查浏览器存储设置。',
      ),
    ).toBeInTheDocument()
    storageSpy.mockRestore()

    const section = await withdrawalSection()
    await form.user.click(
      section.getByRole('button', { name: '重新检查浏览器安全存储' }),
    )
    await form.user.click(section.getByRole('button', { name: '提交提现申请' }))
    await form.user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '确认提交申请',
      }),
    )
    expect(await screen.findByText('提现申请已提交。')).toBeInTheDocument()
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()
  })

  it('fails closed when persistent safety state cannot be read', async () => {
    const mocks = installMocks()
    const originalGetItem = Storage.prototype.getItem
    const storageSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(function (this: Storage, key) {
        if (this === window.sessionStorage && key === withdrawalSafetyKey) {
          throw new DOMException('private storage detail', 'SecurityError')
        }
        return originalGetItem.call(this, key)
      })
    renderReferrals()
    const section = await withdrawalSection()

    expect(
      section.getByText('当前无法读取提现申请安全状态，提现申请已停用。'),
    ).toBeInTheDocument()
    await section.findByText(
      '当前可提交提现申请。请选择服务端提供的方式并填写账户。',
    )
    expect(section.getByLabelText('提现账户')).toBeDisabled()
    expect(mocks.requestWithdrawal).not.toHaveBeenCalled()
    storageSpy.mockRestore()
    await userEvent
      .setup()
      .click(section.getByRole('button', { name: '重新检查浏览器安全存储' }))
    await waitFor(() =>
      expect(section.getByLabelText('提现账户')).toBeEnabled(),
    )
  })

  it('keeps a confirmed result fail closed when marker removal fails', async () => {
    const mocks = installMocks()
    renderReferrals()
    const form = await openConfirmation()
    const originalRemoveItem = Storage.prototype.removeItem
    const storageSpy = vi
      .spyOn(Storage.prototype, 'removeItem')
      .mockImplementation(function (this: Storage, key) {
        if (this === window.sessionStorage && key === withdrawalSafetyKey) {
          throw new DOMException('private storage detail', 'SecurityError')
        }
        return originalRemoveItem.call(this, key)
      })

    await confirmWithdrawal(form)
    expect(await screen.findByText('提现申请已提交。')).toBeInTheDocument()
    expect(
      screen.getByText(
        '申请结果已确认，但无法清除提现申请安全状态；下一笔申请已停用。',
      ),
    ).toBeInTheDocument()
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(form.input).toHaveValue('')
    expect(mocks.requestWithdrawal).toHaveBeenCalledOnce()

    storageSpy.mockRestore()
    await form.user.click(
      (await withdrawalSection()).getByRole('button', {
        name: '重新检查浏览器安全存储',
      }),
    )
    expect(
      await screen.findByRole('checkbox', {
        name: '我了解上一笔提现申请结果无法确认，仍需再次提交新的提现申请。',
      }),
    ).toBeInTheDocument()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'clears Session Core when Withdrawal returns %s',
    async (code) => {
      const mocks = installMocks()
      const session = { current: true }
      mocks.requestWithdrawal.mockImplementation(() => {
        session.current = false
        return Promise.reject(apiError(code, 401))
      })
      window.sessionStorage.setItem(commissionSafetyKey, 'active')
      const { queryClient, router } = renderReferrals(
        createQueryClient(),
        session,
      )
      const form = await openConfirmation()
      await confirmWithdrawal(form)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
      expect(window.sessionStorage.getItem(commissionSafetyKey)).toBe('active')
      expect(
        queryClient.getQueryData(referralsQueryKeys.overview),
      ).toBeUndefined()
      expect(
        queryClient.getQueryData(withdrawalRequestLocalGuardKeys.uncertainty),
      ).toBeUndefined()
    },
  )

  it('clears Session Core when UNKNOWN Options recovery returns AUTH_FAILED', async () => {
    const mocks = installMocks()
    const session = { current: true }
    mocks.requestWithdrawal.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getWithdrawalOptions
      .mockResolvedValueOnce({ enabled: true, methods: [methodOne] })
      .mockImplementationOnce(() => {
        session.current = false
        return Promise.reject(apiError('AUTH_FAILED', 401))
      })
    const { queryClient, router } = renderReferrals(
      createQueryClient(),
      session,
    )
    const form = await openConfirmation()
    await confirmWithdrawal(form)

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(window.sessionStorage.getItem(withdrawalSafetyKey)).toBe('active')
    expect(
      queryClient.getQueryData(referralsQueryKeys.withdrawalOptions),
    ).toBeUndefined()
  })
})
