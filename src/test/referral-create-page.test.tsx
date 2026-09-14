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
import { referralCreateLocalGuardKeys } from '@/features/referrals/referral-create-guard'
import { referralsApi } from '@/features/referrals/referrals-api'
import { referralsQueryKeys } from '@/features/referrals/referrals-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const overview = {
  codes: [{ code: 'OLD1', createdAt: '2026-09-14T01:00:00.000Z' }],
  stats: {
    registeredUsers: 12,
    earnedCommissionMinor: 12_345,
    pendingCommissionMinor: 678,
    commissionRatePercent: 10,
    availableCommissionMinor: 9_000,
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
  return new ApiError({ status, code, message: 'private upstream message' })
}

function installMocks() {
  const getOverview = vi
    .spyOn(referralsApi, 'getOverview')
    .mockResolvedValue(overview)
  const createCode = vi
    .spyOn(referralsApi, 'createCode')
    .mockResolvedValue({ created: true })
  const getCommissions = vi
    .spyOn(referralsApi, 'getCommissions')
    .mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 })
  const getWithdrawalOptions = vi
    .spyOn(referralsApi, 'getWithdrawalOptions')
    .mockResolvedValue({ enabled: false, methods: [] })
  vi.spyOn(accountApi, 'getConfig').mockResolvedValue({
    currency: 'CNY',
    currencySymbol: '¥',
  })
  return { createCode, getCommissions, getOverview, getWithdrawalOptions }
}

function renderReferrals(queryClient: QueryClient = createQueryClient()) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'referral-token')
  queryClient.setQueryData(['private-state'], 'clear-me')
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

async function openConfirmation(user = userEvent.setup()) {
  await screen.findByText('OLD1')
  const trigger = screen.getByRole('button', { name: '创建邀请码' })
  await waitFor(() => expect(trigger).toBeEnabled())
  await user.click(trigger)
  return { dialog: screen.getByRole('dialog'), trigger, user }
}

async function confirmCreate(
  form: Awaited<ReturnType<typeof openConfirmation>>,
) {
  await form.user.click(
    within(form.dialog).getByRole('button', { name: '确认创建' }),
  )
}

function expectLoggedOut(
  router: ReturnType<typeof createAppRouter>,
  queryClient: QueryClient,
) {
  expect(router.state.location.pathname).toBe('/login')
  expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  expect(queryClient.getQueryData(['private-state'])).toBeUndefined()
  expect(queryClient.getQueryData(referralsQueryKeys.overview)).toBeUndefined()
  expect(
    queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
  ).toBeUndefined()
}

describe('Create Referral Code', () => {
  it('gates Create during initial loading and an ordinary Overview error', async () => {
    const mocks = installMocks()
    const initial = deferred<typeof overview>()
    mocks.getOverview.mockReturnValue(initial.promise)
    renderReferrals()

    const trigger = await screen.findByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.createCode).not.toHaveBeenCalled()

    act(() => initial.reject(apiError('UPSTREAM_ERROR')))
    expect(
      await screen.findByText(
        '暂时无法读取推荐概览和邀请码。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(trigger).toBeDisabled()
    expect(mocks.createCode).not.toHaveBeenCalled()
  })

  it('requires a fresh authoritative read when mounting with cached Overview', async () => {
    const mocks = installMocks()
    const fresh = deferred<typeof overview>()
    mocks.getOverview.mockReturnValue(fresh.promise)
    const queryClient = createQueryClient()
    queryClient.setQueryData(referralsQueryKeys.overview, overview)
    renderReferrals(queryClient)

    expect(await screen.findByText('OLD1')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeDisabled()
    expect(mocks.getOverview).toHaveBeenCalledOnce()
    act(() => fresh.resolve(overview))
    await waitFor(() => expect(trigger).toBeEnabled())
  })

  it('keeps stale cached Overview fail closed when the fresh read fails', async () => {
    const mocks = installMocks()
    mocks.getOverview.mockRejectedValue(apiError('UPSTREAM_ERROR'))
    const queryClient = createQueryClient()
    queryClient.setQueryData(referralsQueryKeys.overview, overview)
    renderReferrals(queryClient)

    expect(await screen.findByText('OLD1')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeDisabled()
    await waitFor(() => expect(mocks.getOverview).toHaveBeenCalledTimes(2), {
      timeout: 3_000,
    })
    expect(trigger).toBeDisabled()
    expect(mocks.createCode).not.toHaveBeenCalled()
  })

  it('uses confirmation with zero POST for open, cancel, and Escape', async () => {
    const mocks = installMocks()
    renderReferrals()
    const form = await openConfirmation()

    expect(mocks.createCode).not.toHaveBeenCalled()
    expect(
      within(form.dialog).getByText(
        '将创建一个新的邀请码。Aureole 当前版本不提供邀请码删除操作。',
      ),
    ).toBeInTheDocument()
    await form.user.click(
      within(form.dialog).getByRole('button', { name: '取消' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(form.trigger).toHaveFocus()
    expect(mocks.createCode).not.toHaveBeenCalled()

    await form.user.click(form.trigger)
    await form.user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(form.trigger).toHaveFocus()
    expect(mocks.createCode).not.toHaveBeenCalled()
  })

  it('locks same-tick double confirm and pending close interactions', async () => {
    const mocks = installMocks()
    const pending = deferred<{ created: true }>()
    mocks.createCode.mockReturnValue(pending.promise)
    renderReferrals()
    const form = await openConfirmation()
    const confirm = within(form.dialog).getByRole('button', {
      name: '确认创建',
    })

    act(() => {
      confirm.click()
      confirm.click()
    })
    await waitFor(() => expect(mocks.createCode).toHaveBeenCalledOnce())
    expect(form.trigger).toBeDisabled()
    expect(
      within(form.dialog).getByRole('button', { name: '正在创建…' }),
    ).toBeDisabled()
    expect(
      within(form.dialog).getByRole('button', { name: '取消' }),
    ).toBeDisabled()
    await form.user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => pending.resolve({ created: true }))
    expect(await screen.findByText('邀请码已创建。')).toBeInTheDocument()
    expect(mocks.createCode).toHaveBeenCalledOnce()
  })

  it('blocks an immediate same-tick confirm from stale React authority while Overview refetch starts', async () => {
    const mocks = installMocks()
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    const background = deferred<typeof overview>()
    const create = deferred<{ created: true }>()
    mocks.getOverview.mockReturnValueOnce(background.promise)
    mocks.createCode.mockReturnValue(create.promise)
    const confirm = within(form.dialog).getByRole('button', {
      name: '确认创建',
    })

    act(() => {
      void queryClient.refetchQueries({
        queryKey: referralsQueryKeys.overview,
        exact: true,
      })
      confirm.click()
    })
    await act(async () => Promise.resolve())
    expect(mocks.createCode).not.toHaveBeenCalled()

    act(() => background.resolve(overview))
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    await waitFor(() => expect(mocks.createCode).toHaveBeenCalledOnce())
    act(() => create.resolve({ created: true }))
    expect(await screen.findByText('邀请码已创建。')).toBeInTheDocument()
  })

  it('keeps success confirmed, refetches only Overview, and does not infer a code', async () => {
    const mocks = installMocks()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    mocks.getOverview.mockResolvedValueOnce(overview).mockResolvedValueOnce({
      ...overview,
      codes: [
        ...overview.codes,
        { code: 'NEW999', createdAt: '2026-09-14T01:00:01.000Z' },
      ],
    })
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    await confirmCreate(form)

    expect(await screen.findByText('邀请码已创建。')).toBeInTheDocument()
    expect(await screen.findByText('NEW999')).toBeInTheDocument()
    expect(mocks.createCode).toHaveBeenCalledOnce()
    expect(mocks.getOverview).toHaveBeenCalledTimes(2)
    expect(mocks.getCommissions).toHaveBeenCalledOnce()
    expect(mocks.getWithdrawalOptions).toHaveBeenCalledOnce()
    expect(writeText).not.toHaveBeenCalled()
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).not.toBe('active')
    expect(screen.queryByText(/新创建/)).toBeNull()
    expect(screen.queryByText(/刚刚创建/)).toBeNull()
  })

  it('preserves confirmed success and fails closed through manual GET-only recovery', async () => {
    const mocks = installMocks()
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValue(apiError('UPSTREAM_ERROR'))
    renderReferrals()
    const form = await openConfirmation()
    await confirmCreate(form)

    expect(
      await screen.findByText(
        '邀请码已创建，但暂时无法读取最新邀请码列表。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('邀请码已创建。')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeDisabled()
    expect(screen.queryByText('private upstream message')).toBeNull()

    mocks.getOverview.mockResolvedValue(overview)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: '重新读取邀请码列表' }))
    await waitFor(() => expect(trigger).toBeEnabled())
    expect(mocks.createCode).toHaveBeenCalledOnce()
  })

  it('handles the code limit as a definitive failure and reconciles Overview', async () => {
    const mocks = installMocks()
    mocks.createCode.mockRejectedValue(
      apiError('REFERRAL_CODE_LIMIT_REACHED', 409),
    )
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    await confirmCreate(form)

    expect(
      await screen.findByText('邀请码数量已达到当前上限。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('private upstream message')).toBeNull()
    expect(mocks.createCode).toHaveBeenCalledOnce()
    expect(mocks.getOverview).toHaveBeenCalledTimes(2)
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).not.toBe('active')
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'referral-token',
    )
  })

  it('keeps a limit result fail closed when Overview recovery fails', async () => {
    const mocks = installMocks()
    mocks.createCode.mockRejectedValue(
      apiError('REFERRAL_CODE_LIMIT_REACHED', 409),
    )
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValue(apiError('UPSTREAM_ERROR'))
    renderReferrals()
    const form = await openConfirmation()
    await confirmCreate(form)

    expect(
      await screen.findByText(
        '当前邀请码列表暂时无法重新读取。请先恢复列表，再尝试创建。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(mocks.createCode).toHaveBeenCalledOnce()
  })

  it.each([
    ['NETWORK_ERROR', apiError('NETWORK_ERROR', 0)],
    ['UPSTREAM_TIMEOUT', apiError('UPSTREAM_TIMEOUT', 504)],
    ['UPSTREAM_ERROR', apiError('UPSTREAM_ERROR')],
    ['MALFORMED_RESPONSE', apiError('MALFORMED_RESPONSE', 200)],
    ['plain Error', new Error('private exception')],
  ])(
    'treats %s as UNKNOWN and recovers without causal inference',
    async (_name, error) => {
      const mocks = installMocks()
      mocks.createCode.mockRejectedValue(error)
      mocks.getOverview.mockResolvedValueOnce(overview).mockResolvedValueOnce({
        ...overview,
        codes: [
          ...overview.codes,
          { code: 'NEW999', createdAt: '2026-09-14T01:00:01.000Z' },
        ],
      })
      renderReferrals()
      const form = await openConfirmation()
      await confirmCreate(form)

      expect(
        await screen.findByText('邀请码创建结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          '已重新读取当前邀请码列表。请先核对列表，避免重复创建。',
        ),
      ).toBeInTheDocument()
      expect(screen.getByText('NEW999')).toBeInTheDocument()
      expect(screen.queryByText('邀请码已创建。')).toBeNull()
      expect(screen.queryByText(/新创建/)).toBeNull()
      expect(mocks.createCode).toHaveBeenCalledOnce()
      expect(screen.getByRole('button', { name: '创建邀请码' })).toBeDisabled()
    },
  )

  it('activates the session uncertainty marker before UNKNOWN recovery completes', async () => {
    const mocks = installMocks()
    const recovery = deferred<typeof overview>()
    mocks.createCode.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockReturnValueOnce(recovery.promise)
    const { queryClient } = renderReferrals()
    const form = await openConfirmation()
    await confirmCreate(form)

    await waitFor(() => expect(mocks.createCode).toHaveBeenCalledOnce())
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).toBe('active')
    expect(
      JSON.stringify(
        queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
      ),
    ).not.toMatch(/referral-token|OLD1|member@example.com/)

    act(() => recovery.resolve(overview))
    await screen.findByRole('checkbox', {
      name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
    })
  })

  it('requires acknowledgement and a new confirmation before a second POST', async () => {
    const mocks = installMocks()
    mocks.createCode
      .mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
      .mockResolvedValueOnce({ created: true })
    renderReferrals()
    const form = await openConfirmation()
    await confirmCreate(form)
    await screen.findByText('邀请码创建结果暂时无法确认。')

    const acknowledgement = await screen.findByRole('checkbox', {
      name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
    })
    await form.user.click(acknowledgement)
    expect(mocks.createCode).toHaveBeenCalledOnce()
    const trigger = screen.getByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeEnabled()
    await form.user.click(trigger)
    expect(mocks.createCode).toHaveBeenCalledOnce()
    await form.user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '确认创建',
      }),
    )
    expect(await screen.findByText('邀请码已创建。')).toBeInTheDocument()
    expect(mocks.createCode).toHaveBeenCalledTimes(2)
  })

  it('keeps successful UNKNOWN recovery guarded across remount until acknowledgement', async () => {
    const mocks = installMocks()
    mocks.createCode
      .mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
      .mockResolvedValueOnce({ created: true })
    const queryClient = createQueryClient()
    const first = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmCreate(form)
    await screen.findByText('邀请码创建结果暂时无法确认。')
    expect(mocks.createCode).toHaveBeenCalledOnce()

    first.unmount()
    renderReferrals(queryClient)
    await screen.findByText('OLD1')
    const trigger = screen.getByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeDisabled()
    const acknowledgement = await screen.findByRole('checkbox', {
      name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
    })
    await userEvent.setup().click(acknowledgement)
    expect(mocks.createCode).toHaveBeenCalledOnce()
    expect(trigger).toBeEnabled()

    await userEvent.setup().click(trigger)
    expect(mocks.createCode).toHaveBeenCalledOnce()
    await userEvent.setup().click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '确认创建',
      }),
    )
    expect(await screen.findByText('邀请码已创建。')).toBeInTheDocument()
    expect(mocks.createCode).toHaveBeenCalledTimes(2)
  })

  it('restores the guard when acknowledgement is unchecked and clears it for the next remount', async () => {
    const mocks = installMocks()
    mocks.createCode.mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
    const queryClient = createQueryClient()
    const first = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmCreate(form)
    const acknowledgement = await screen.findByRole('checkbox', {
      name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
    })
    const trigger = screen.getByRole('button', { name: '创建邀请码' })

    await form.user.click(acknowledgement)
    expect(acknowledgement).toBeChecked()
    expect(trigger).toBeEnabled()
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).toBe('acknowledged')

    await form.user.click(acknowledgement)
    expect(acknowledgement).not.toBeChecked()
    expect(trigger).toBeDisabled()
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).toBe('active')

    await form.user.click(acknowledgement)
    expect(trigger).toBeEnabled()
    first.unmount()
    renderReferrals(queryClient)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '创建邀请码' })).toBeEnabled(),
    )
    expect(
      screen.queryByRole('checkbox', {
        name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
      }),
    ).toBeNull()

    const remountedTrigger = screen.getByRole('button', {
      name: '创建邀请码',
    })
    await userEvent.setup().click(remountedTrigger)
    expect(mocks.createCode).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clears active uncertainty on logout before a new authenticated session', async () => {
    const mocks = installMocks()
    mocks.createCode.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    const queryClient = createQueryClient()
    const first = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmCreate(form)
    await screen.findByRole('checkbox', {
      name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
    })
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).toBe('active')

    await form.user.click(screen.getByRole('button', { name: '退出登录' }))
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expect(
      queryClient.getQueryData(referralCreateLocalGuardKeys.uncertainty),
    ).toBeUndefined()

    first.unmount()
    mocks.createCode.mockResolvedValue({ created: true })
    renderReferrals(queryClient)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '创建邀请码' })).toBeEnabled(),
    )
    expect(
      screen.queryByRole('checkbox', {
        name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
      }),
    ).toBeNull()
  })

  it('remains fail closed after UNKNOWN recovery failure and remount', async () => {
    const mocks = installMocks()
    mocks.createCode.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValue(apiError('UPSTREAM_ERROR'))
    const queryClient = createQueryClient()
    const first = renderReferrals(queryClient)
    const form = await openConfirmation()
    await confirmCreate(form)
    expect(
      await screen.findByText(
        '当前邀请码列表暂时无法重新读取。请先恢复列表，暂时不要再次创建。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(mocks.createCode).toHaveBeenCalledOnce()

    first.unmount()
    const remountRead = deferred<typeof overview>()
    mocks.getOverview.mockReturnValue(remountRead.promise)
    renderReferrals(queryClient)
    const trigger = await screen.findByRole('button', { name: '创建邀请码' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.createCode).toHaveBeenCalledOnce()
    act(() => remountRead.resolve(overview))
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', {
          name: '我已检查当前邀请码列表，仍需再次创建一个邀请码。',
        }),
      ).toBeInTheDocument(),
    )
    expect(trigger).toBeDisabled()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'clears the sealed session when Create returns %s',
    async (code) => {
      const mocks = installMocks()
      mocks.createCode.mockRejectedValue(apiError(code, 401))
      const { queryClient, router } = renderReferrals()
      const form = await openConfirmation()
      await confirmCreate(form)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
    },
  )

  it.each(['success', 'limit', 'unknown'] as const)(
    'clears the sealed session when %s reconciliation returns AUTH_FAILED',
    async (outcome) => {
      const mocks = installMocks()
      if (outcome === 'limit') {
        mocks.createCode.mockRejectedValue(
          apiError('REFERRAL_CODE_LIMIT_REACHED', 409),
        )
      } else if (outcome === 'unknown') {
        mocks.createCode.mockRejectedValue(apiError('NETWORK_ERROR', 0))
      }
      mocks.getOverview
        .mockResolvedValueOnce(overview)
        .mockRejectedValue(apiError('AUTH_FAILED', 401))
      const { queryClient, router } = renderReferrals()
      const form = await openConfirmation()
      await confirmCreate(form)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
    },
  )

  it('clears the sealed session when manual Overview recovery returns AUTH_REQUIRED', async () => {
    const mocks = installMocks()
    mocks.createCode.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValue(apiError('UPSTREAM_ERROR'))
    const { queryClient, router } = renderReferrals()
    const form = await openConfirmation()
    await confirmCreate(form)
    const retry = await screen.findByRole(
      'button',
      { name: '重新读取邀请码列表' },
      { timeout: 3_000 },
    )

    mocks.getOverview.mockRejectedValue(apiError('AUTH_REQUIRED', 401))
    await userEvent.setup().click(retry)
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expectLoggedOut(router, queryClient)
    expect(mocks.createCode).toHaveBeenCalledOnce()
  })
})
