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
import type { AuthApi } from '@/features/auth/auth-api'
import { ticketsApi, type TicketDetail } from '@/features/tickets/tickets-api'
import { ticketsQueryKeys } from '@/features/tickets/tickets-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const ticket = {
  id: '7',
  subject: 'Connection issue',
  priority: 'normal' as const,
  status: 'open' as const,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
}

const waitingDetail: TicketDetail = {
  ...ticket,
  messages: [
    {
      id: '11',
      content: 'Original message',
      fromMe: true,
      createdAt: '2026-09-13T00:10:00.000Z',
    },
  ],
}

const replyableDetail: TicketDetail = {
  ...waitingDetail,
  messages: [
    ...waitingDetail.messages,
    {
      id: '12',
      content: 'Support response',
      fromMe: false,
      createdAt: '2026-09-13T00:20:00.000Z',
    },
  ],
}

const emptyDetail: TicketDetail = {
  ...ticket,
  messages: [],
}

const highestIdSupportTailUserDetail: TicketDetail = {
  ...ticket,
  messages: [replyableDetail.messages[1]!, waitingDetail.messages[0]!],
}

const highestIdUserTailSupportDetail: TicketDetail = {
  ...ticket,
  messages: [
    {
      id: '13',
      content: 'Latest user message',
      fromMe: true,
      createdAt: '2026-09-13T00:30:00.000Z',
    },
    replyableDetail.messages[1]!,
  ],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function apiError(code: string, status = 502) {
  return new ApiError({ status, code, message: `private ${code}` })
}

function installMocks() {
  const getList = vi.spyOn(ticketsApi, 'getList').mockResolvedValue([ticket])
  const getDetail = vi
    .spyOn(ticketsApi, 'getDetail')
    .mockResolvedValue(replyableDetail)
  const reply = vi
    .spyOn(ticketsApi, 'reply')
    .mockResolvedValue({ replied: true })
  const close = vi
    .spyOn(ticketsApi, 'close')
    .mockResolvedValue({ closed: true })
  return { close, getDetail, getList, reply }
}

function renderSupport(queryClient: QueryClient = createQueryClient()) {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'ticket-token')
  queryClient.setQueryData(['private-state'], 'clear-me')
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: null,
      status: 'active',
    }),
  }
  const router = createAppRouter({ initialEntries: ['/support'] })
  const rendered = render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router, unmount: rendered.unmount }
}

async function openDetailDialog(user = userEvent.setup()) {
  await user.click(
    await screen.findByRole('button', { name: /Connection issue/ }),
  )
  const dialog = await screen.findByRole('dialog')
  return { dialog, user }
}

async function openDetail(user = userEvent.setup()) {
  const opened = await openDetailDialog(user)
  const { dialog } = opened
  const reply = await within(dialog).findByRole('textbox', {
    name: '回复工单',
  })
  return {
    close: within(dialog).getByRole('button', { name: '关闭工单' }),
    dialog,
    reply,
    send: within(dialog).getByRole('button', { name: '发送回复' }),
    user: opened.user,
  }
}

function expectLoggedOut(
  router: ReturnType<typeof createAppRouter>,
  queryClient: QueryClient,
) {
  expect(router.state.location.pathname).toBe('/login')
  expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
  expect(queryClient.getQueryData(['private-state'])).toBeUndefined()
  expect(queryClient.getQueryData(ticketsQueryKeys.list)).toBeUndefined()
}

describe('Support Ticket Detail authority and actions', () => {
  it('blocks Reply when the user spoke last while preserving Close', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockResolvedValue(waitingDetail)
    renderSupport()
    const { dialog } = await openDetailDialog()

    expect(
      within(dialog).getByText('已发送，等待技术支持回复后可继续回复。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('textbox', { name: '回复工单' }),
    ).toBeNull()
    expect(
      within(dialog).queryByRole('button', { name: '发送回复' }),
    ).toBeNull()
    expect(
      within(dialog).getByRole('button', { name: '关闭工单' }),
    ).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('allows Reply when technical support spoke last', async () => {
    const mocks = installMocks()
    renderSupport()
    const form = await openDetail()

    expect(form.reply).toBeEnabled()
    expect(form.send).toBeEnabled()
    expect(form.close).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('uses the greatest message ID when support is not at the array tail', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockResolvedValue(highestIdSupportTailUserDetail)
    renderSupport()
    const form = await openDetail()

    expect(form.reply).toBeEnabled()
    expect(form.send).toBeEnabled()
    expect(form.close).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('uses the greatest message ID when a lower support message is at the array tail', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockResolvedValue(highestIdUserTailSupportDetail)
    renderSupport()
    const { dialog } = await openDetailDialog()

    expect(
      within(dialog).getByText('已发送，等待技术支持回复后可继续回复。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('textbox', { name: '回复工单' }),
    ).toBeNull()
    expect(
      within(dialog).queryByRole('button', { name: '发送回复' }),
    ).toBeNull()
    expect(
      within(dialog).getByRole('button', { name: '关闭工单' }),
    ).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('fails closed for empty message history while preserving Close', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockResolvedValue(emptyDetail)
    renderSupport()
    const { dialog } = await openDetailDialog()

    expect(
      within(dialog).getByText('当前回复记录为空，暂时不能回复。'),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('textbox', { name: '回复工单' }),
    ).toBeNull()
    expect(
      within(dialog).queryByRole('button', { name: '发送回复' }),
    ).toBeNull()
    expect(
      within(dialog).getByRole('button', { name: '关闭工单' }),
    ).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('blocks a stale Reply after authoritative Detail changes to user-last', async () => {
    const mocks = installMocks()
    const { queryClient } = renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'stale reply' } })
    const staleForm = form.send.closest('form')!

    act(() => {
      queryClient.setQueryData(
        ticketsQueryKeys.detail('7'),
        highestIdUserTailSupportDetail,
      )
      fireEvent.submit(staleForm)
    })

    expect(
      await screen.findByText('已发送，等待技术支持回复后可继续回复。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发送回复' })).toBeNull()
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('enables Reply when authoritative Detail changes to support-last', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockResolvedValue(highestIdUserTailSupportDetail)
    const { queryClient } = renderSupport()
    const { dialog } = await openDetailDialog()
    expect(
      within(dialog).getByText('已发送，等待技术支持回复后可继续回复。'),
    ).toBeInTheDocument()

    act(() => {
      queryClient.setQueryData(
        ticketsQueryKeys.detail('7'),
        highestIdSupportTailUserDetail,
      )
    })

    expect(
      await within(dialog).findByRole('textbox', { name: '回复工单' }),
    ).toBeEnabled()
    expect(
      within(dialog).getByRole('button', { name: '发送回复' }),
    ).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('does not expose mutation controls before the initial Detail succeeds', async () => {
    const mocks = installMocks()
    const pending = deferred<typeof replyableDetail>()
    mocks.getDetail.mockReturnValue(pending.promise)
    renderSupport()
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: /Connection issue/ }),
    )
    expect(await screen.findByText('正在读取工单详情…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发送回复' })).toBeNull()
    expect(screen.queryByRole('button', { name: '关闭工单' })).toBeNull()
    expect(mocks.reply).not.toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()

    act(() => pending.resolve(replyableDetail))
    expect(
      await screen.findByRole('button', { name: '发送回复' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeEnabled()
  })

  it('shows closed state without Reply or Close actions', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockResolvedValue({
      ...replyableDetail,
      status: 'closed',
    })
    renderSupport()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: /Connection issue/ }),
    )

    expect(await screen.findByText('该工单已关闭。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发送回复' })).toBeNull()
    expect(screen.queryByRole('button', { name: '关闭工单' })).toBeNull()
  })

  it('disables actions for cached Detail during refetch and restores them only after success', async () => {
    const mocks = installMocks()
    const pending = deferred<typeof replyableDetail>()
    mocks.getDetail.mockReturnValue(pending.promise)
    const queryClient = createQueryClient()
    queryClient.setQueryData(ticketsQueryKeys.detail('7'), replyableDetail, {
      updatedAt: 0,
    })
    renderSupport(queryClient)
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: /Connection issue/ }),
    )
    const send = await screen.findByRole('button', { name: '发送回复' })
    expect(send).toBeDisabled()
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeDisabled()
    fireEvent.submit(send.closest('form')!)
    expect(mocks.reply).not.toHaveBeenCalled()

    act(() => pending.resolve(replyableDetail))
    await waitFor(() => expect(send).toBeEnabled())
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeEnabled()
  })

  it('keeps stale cached Detail fail-closed after refetch error until Retry succeeds', async () => {
    const mocks = installMocks()
    mocks.getDetail
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      .mockResolvedValueOnce(replyableDetail)
    const queryClient = createQueryClient()
    queryClient.setQueryData(ticketsQueryKeys.detail('7'), replyableDetail, {
      updatedAt: 0,
    })
    renderSupport(queryClient)
    const user = userEvent.setup()

    await user.click(
      await screen.findByRole('button', { name: /Connection issue/ }),
    )
    expect(
      await screen.findByText('暂时无法读取工单详情。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送回复' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '发送回复' })).toBeEnabled(),
    )
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('checks authority again when a background Detail refetch starts with action UI open', async () => {
    const mocks = installMocks()
    const refetch = deferred<typeof replyableDetail>()
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockReturnValueOnce(refetch.promise)
    const { queryClient } = renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'Do not send yet' } })
    await form.user.click(form.close)
    const confirm = screen.getByRole('button', { name: '确认关闭工单' })

    void queryClient.refetchQueries({
      queryKey: ticketsQueryKeys.detail('7'),
      exact: true,
    })
    await waitFor(() => expect(form.send).toBeDisabled())
    fireEvent.submit(form.send.closest('form')!)
    fireEvent.click(confirm)
    expect(mocks.reply).not.toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()
    act(() => refetch.resolve(replyableDetail))
  })
})

describe('Support Ticket Reply mutation', () => {
  it('preserves raw input, sends once for same-tick submits, locks Close, and reconciles without local append', async () => {
    const mocks = installMocks()
    const post = deferred<{ replied: true }>()
    const recovery = deferred<typeof replyableDetail>()
    const raw = ' first line\n<script>alert(1)</script> '
    mocks.reply.mockReturnValue(post.promise)
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockReturnValueOnce(recovery.promise)
    renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: raw } })
    expect(mocks.reply).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
    expect(JSON.stringify(localStorage)).not.toContain('<script>')
    expect(JSON.stringify(sessionStorage)).not.toContain('<script>')

    fireEvent.submit(form.send.closest('form')!)
    fireEvent.submit(form.send.closest('form')!)
    await waitFor(() => expect(mocks.reply).toHaveBeenCalledOnce())
    expect(mocks.reply).toHaveBeenCalledWith('ticket-token', '7', {
      message: raw,
    })
    expect(form.reply).toBeDisabled()
    expect(form.close).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在发送…' })).toBeDisabled()
    await form.user.click(screen.getByRole('button', { name: '关闭工单详情' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => post.resolve({ replied: true }))
    expect(await screen.findByText('回复已发送。')).toBeInTheDocument()
    expect(form.reply).toHaveValue('')
    expect(screen.queryByText(raw)).toBeNull()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(mocks.getList).toHaveBeenCalledTimes(2)

    act(() =>
      recovery.resolve({
        ...replyableDetail,
        messages: [
          {
            id: '13',
            content: raw,
            fromMe: true,
            createdAt: '2026-09-13T01:01:00.000Z',
          },
          ...replyableDetail.messages,
        ],
      }),
    )
    expect(
      await screen.findByText((content) =>
        content.includes('<script>alert(1)</script>'),
      ),
    ).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect(
      screen.getByText('已发送，等待技术支持回复后可继续回复。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: '回复工单' })).toBeNull()
    expect(screen.queryByRole('button', { name: '发送回复' })).toBeNull()
    expect(mocks.reply).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeEnabled()
  })

  it('keeps confirmed Reply success when Detail reconciliation fails and recovers with GET only', async () => {
    const mocks = installMocks()
    const queryClient = createQueryClient()
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    })
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      .mockResolvedValueOnce(replyableDetail)
    renderSupport(queryClient)
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'confirmed reply' } })
    await form.user.click(form.send)

    expect(await screen.findByText('回复已发送。')).toBeInTheDocument()
    expect(
      await screen.findByText(
        '工单详情暂时无法重新读取，恢复前不能再次回复或关闭工单。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('回复失败')).toBeNull()
    expect(form.reply).toHaveValue('')
    expect(form.send).toBeDisabled()
    expect(form.close).toBeDisabled()

    await form.user.click(
      screen.getByRole('button', { name: '重新读取工单详情' }),
    )
    await waitFor(() => expect(form.send).toBeEnabled())
    expect(mocks.reply).toHaveBeenCalledOnce()
    expect(mocks.getDetail).toHaveBeenCalledTimes(3)
  })

  it('validates empty and 10001-character messages locally while keeping text editable', async () => {
    const mocks = installMocks()
    renderSupport()
    const form = await openDetail()
    await form.user.click(form.send)
    expect(await screen.findByText('请输入回复内容。')).toBeInTheDocument()
    fireEvent.change(form.reply, { target: { value: 'm'.repeat(10_001) } })
    await form.user.click(form.send)
    expect(
      await screen.findByText('回复内容不能超过 10000 个字符。'),
    ).toBeInTheDocument()
    expect(form.reply).toBeEnabled()
    expect(mocks.reply).not.toHaveBeenCalled()
  })

  it('handles definitive Reply errors safely without automatic retry', async () => {
    const cases = [
      {
        code: 'TICKET_REPLY_FAILED',
        status: 409,
        expected: '当前工单暂时无法回复，请重新读取工单状态后再试。',
        detailCalls: 2,
      },
      {
        code: 'VALIDATION_ERROR',
        status: 400,
        expected: '回复内容无效，请检查后重新发送。',
        detailCalls: 1,
      },
    ]

    for (const testCase of cases) {
      vi.restoreAllMocks()
      const mocks = installMocks()
      mocks.reply.mockRejectedValue(apiError(testCase.code, testCase.status))
      const rendered = renderSupport()
      const form = await openDetail()
      fireEvent.change(form.reply, { target: { value: 'editable reply' } })
      await form.user.click(form.send)

      expect(await screen.findByText(testCase.expected)).toBeInTheDocument()
      expect(screen.queryByText(`private ${testCase.code}`)).toBeNull()
      expect(form.reply).toHaveValue('editable reply')
      expect(form.reply).toBeEnabled()
      expect(mocks.reply).toHaveBeenCalledOnce()
      expect(mocks.getDetail).toHaveBeenCalledTimes(testCase.detailCalls)
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
        'ticket-token',
      )
      rendered.unmount()
    }
  })

  it('handles TICKET_NOT_FOUND by preserving the canonical List and suppressing actions', async () => {
    const mocks = installMocks()
    mocks.reply.mockRejectedValue(apiError('TICKET_NOT_FOUND', 404))
    renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'reply' } })
    await form.user.click(form.send)

    expect(
      await screen.findByText('该工单不存在或已不可用。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('private TICKET_NOT_FOUND')).toBeNull()
    expect(mocks.reply).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '发送回复' })).toBeNull()
    expect(screen.queryByRole('button', { name: '关闭工单' })).toBeNull()
    expect(screen.getAllByText('Connection issue')).not.toHaveLength(0)
  })

  it.each([
    apiError('NETWORK_ERROR', 0),
    apiError('UPSTREAM_TIMEOUT', 504),
    apiError('UPSTREAM_ERROR'),
    apiError('MALFORMED_RESPONSE', 200),
    new Error('unexpected private error'),
  ])(
    'keeps Reply outcome UNKNOWN after same-looking authoritative recovery',
    async (error) => {
      const mocks = installMocks()
      const submitted = 'same looking reply'
      mocks.reply.mockRejectedValue(error)
      mocks.getDetail
        .mockResolvedValueOnce(replyableDetail)
        .mockResolvedValueOnce(replyableDetail)
      renderSupport()
      const form = await openDetail()
      fireEvent.change(form.reply, { target: { value: submitted } })
      await form.user.click(form.send)

      expect(
        await screen.findByText('回复结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          '已重新读取当前回复记录，但无法据此判断刚才的回复结果。',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText('回复已发送。')).toBeNull()
      expect(screen.queryByText(/刚才回复成功|刚才回复失败/)).toBeNull()
      expect(mocks.reply).toHaveBeenCalledOnce()
      expect(mocks.getDetail).toHaveBeenCalledTimes(2)
      expect(form.send).toBeDisabled()

      const acknowledgement = screen.getByRole('checkbox', {
        name: '我已核对当前回复记录，仍需重新发送此回复。',
      })
      await form.user.click(acknowledgement)
      expect(form.send).toBeEnabled()
      fireEvent.change(form.reply, { target: { value: `${submitted}!` } })
      expect(acknowledgement).not.toBeChecked()
      expect(form.send).toBeDisabled()
    },
  )

  it('keeps Reply UNKNOWN without acknowledgement when recovered Detail is closed', async () => {
    const mocks = installMocks()
    mocks.reply.mockRejectedValue(apiError('UPSTREAM_ERROR'))
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockResolvedValueOnce({ ...replyableDetail, status: 'closed' })
    renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'uncertain reply' } })
    await form.user.click(form.send)

    expect(
      await screen.findByText('回复结果暂时无法确认。'),
    ).toBeInTheDocument()
    expect(screen.getByText('当前工单已关闭。')).toBeInTheDocument()
    expect(screen.queryByText('回复已发送。')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '发送回复' })).toBeNull()
    expect(screen.queryByRole('button', { name: '关闭工单' })).toBeNull()
  })

  it('survives UNKNOWN recovery failure and remount through the fresh Detail authority gate', async () => {
    const mocks = installMocks()
    const readError = apiError('UPSTREAM_ERROR')
    mocks.reply.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockRejectedValueOnce(readError)
      .mockRejectedValueOnce(readError)
      .mockResolvedValueOnce(replyableDetail)
    const queryClient = createQueryClient()
    queryClient.setDefaultOptions({
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 30_000,
      },
      mutations: { retry: false },
    })
    renderSupport(queryClient)
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'uncertain reply' } })
    await form.user.click(form.send)

    expect(
      await screen.findByRole(
        'button',
        { name: '重新读取工单详情' },
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(form.send).toBeDisabled()
    expect(form.close).toBeDisabled()
    await form.user.click(screen.getByRole('button', { name: '关闭工单详情' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await form.user.click(
      screen.getByRole('button', { name: /Connection issue/ }),
    )
    expect(
      await screen.findByText('暂时无法读取工单详情。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送回复' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeDisabled()
    expect(mocks.reply).toHaveBeenCalledOnce()

    await form.user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() =>
      expect(
        queryClient.getQueryState(ticketsQueryKeys.detail('7')),
      ).toMatchObject({
        status: 'success',
        fetchStatus: 'idle',
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '回复工单' })).toBeEnabled(),
    )
    expect(
      screen.queryByRole('checkbox', {
        name: '我已核对当前回复记录，仍需重新发送此回复。',
      }),
    ).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '发送回复' })).toBeEnabled(),
    )
    expect(mocks.reply).toHaveBeenCalledOnce()
  })
})

describe('Support Ticket Close mutation', () => {
  it('requires confirmation, restores focus on cancel, sends once, and waits for authoritative closed Detail', async () => {
    const mocks = installMocks()
    const post = deferred<{ closed: true }>()
    const recovery = deferred<typeof replyableDetail>()
    mocks.close.mockReturnValue(post.promise)
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockReturnValueOnce(recovery.promise)
    renderSupport()
    const form = await openDetail()

    await form.user.click(form.close)
    expect(mocks.close).not.toHaveBeenCalled()
    expect(screen.getByText('确认关闭工单？')).toBeInTheDocument()
    expect(
      screen.getByText('关闭后可能无法继续回复。实际状态由服务端决定。'),
    ).toBeInTheDocument()
    await form.user.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(screen.queryByText('确认关闭工单？')).toBeNull())
    expect(form.close).toHaveFocus()
    expect(mocks.close).not.toHaveBeenCalled()

    await form.user.click(form.close)
    const confirm = screen.getByRole('button', { name: '确认关闭工单' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    expect(mocks.close).toHaveBeenCalledWith('ticket-token', '7')
    expect(form.reply).toBeDisabled()

    act(() => post.resolve({ closed: true }))
    expect(await screen.findByText('工单已关闭。')).toBeInTheDocument()
    expect(screen.getAllByText('处理中')).not.toHaveLength(0)
    expect(screen.queryByText('该工单已关闭。')).toBeNull()
    act(() => recovery.resolve({ ...replyableDetail, status: 'closed' }))
    expect(await screen.findByText('该工单已关闭。')).toBeInTheDocument()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(mocks.getList).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('button', { name: '关闭工单' })).toBeNull()
  })

  it('uses one shared same-tick lock across Reply and Close', async () => {
    const mocks = installMocks()
    const closePost = deferred<{ closed: true }>()
    mocks.close.mockReturnValue(closePost.promise)
    renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'reply loses lock' } })
    await form.user.click(form.close)
    const confirm = screen.getByRole('button', { name: '确认关闭工单' })

    fireEvent.click(confirm)
    fireEvent.submit(form.send.closest('form')!)
    await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    expect(mocks.reply).not.toHaveBeenCalled()
    act(() => closePost.resolve({ closed: true }))
  })

  it('keeps confirmed Close success when Detail reconciliation fails and recovers with GET only', async () => {
    const mocks = installMocks()
    const queryClient = createQueryClient()
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    })
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      .mockResolvedValueOnce({ ...replyableDetail, status: 'closed' })
    renderSupport(queryClient)
    const form = await openDetail()
    await form.user.click(form.close)
    await form.user.click(screen.getByRole('button', { name: '确认关闭工单' }))

    expect(await screen.findByText('工单已关闭。')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: '重新读取工单详情' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/工单关闭未能完成/)).toBeNull()
    expect(screen.getByRole('button', { name: '发送回复' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '关闭工单' })).toBeDisabled()

    await form.user.click(
      screen.getByRole('button', { name: '重新读取工单详情' }),
    )
    expect(await screen.findByText('该工单已关闭。')).toBeInTheDocument()
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.getDetail).toHaveBeenCalledTimes(3)
  })

  it('handles TICKET_CLOSE_FAILED safely and requires a new confirmation', async () => {
    const mocks = installMocks()
    mocks.close.mockRejectedValue(apiError('TICKET_CLOSE_FAILED'))
    renderSupport()
    const form = await openDetail()
    await form.user.click(form.close)
    await form.user.click(screen.getByRole('button', { name: '确认关闭工单' }))

    expect(
      await screen.findByText('工单关闭未能完成，请重新读取工单状态后再试。'),
    ).toBeInTheDocument()
    expect(screen.queryByText('private TICKET_CLOSE_FAILED')).toBeNull()
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(form.close).toBeEnabled()
    await form.user.click(form.close)
    expect(screen.getByText('确认关闭工单？')).toBeInTheDocument()
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('keeps Close UNKNOWN causal boundary when recovered Detail is closed', async () => {
    const mocks = installMocks()
    mocks.close.mockRejectedValue(apiError('UPSTREAM_TIMEOUT', 504))
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockResolvedValueOnce({ ...replyableDetail, status: 'closed' })
    renderSupport()
    const form = await openDetail()
    await form.user.click(form.close)
    await form.user.click(screen.getByRole('button', { name: '确认关闭工单' }))

    expect(
      await screen.findByText('关闭请求结果暂时无法确认。'),
    ).toBeInTheDocument()
    expect(screen.getByText('当前工单状态为已关闭。')).toBeInTheDocument()
    expect(screen.queryByText('工单已关闭。')).toBeNull()
    expect(screen.queryByText(/刚才.*关闭请求成功/)).toBeNull()
    expect(screen.queryByRole('button', { name: '关闭工单' })).toBeNull()
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('requires acknowledgement and a new confirmation before resubmitting Close after UNKNOWN open recovery', async () => {
    const mocks = installMocks()
    mocks.close
      .mockRejectedValueOnce(apiError('NETWORK_ERROR', 0))
      .mockResolvedValueOnce({ closed: true })
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockResolvedValueOnce(replyableDetail)
      .mockResolvedValueOnce({ ...replyableDetail, status: 'closed' })
    renderSupport()
    const form = await openDetail()
    await form.user.click(form.close)
    await form.user.click(screen.getByRole('button', { name: '确认关闭工单' }))

    expect(
      await screen.findByText(
        '当前工单仍为开启状态，但无法据此判断刚才的关闭请求结果。',
      ),
    ).toBeInTheDocument()
    expect(form.close).toBeDisabled()
    await form.user.click(
      screen.getByRole('checkbox', {
        name: '我已核对当前工单仍为开启状态，仍需再次提交关闭请求。',
      }),
    )
    expect(form.close).toBeEnabled()
    await form.user.click(form.close)
    expect(mocks.close).toHaveBeenCalledOnce()
    await form.user.click(screen.getByRole('button', { name: '确认关闭工单' }))
    await waitFor(() => expect(mocks.close).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('工单已关闭。')).toBeInTheDocument()
  })

  it('allows only manual Detail GET after Close UNKNOWN recovery failure', async () => {
    const mocks = installMocks()
    const queryClient = createQueryClient()
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    })
    mocks.close.mockRejectedValue(apiError('MALFORMED_RESPONSE', 200))
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      .mockResolvedValueOnce(replyableDetail)
    renderSupport(queryClient)
    const form = await openDetail()
    await form.user.click(form.close)
    await form.user.click(screen.getByRole('button', { name: '确认关闭工单' }))

    expect(
      await screen.findByText('关闭请求结果暂时无法确认。'),
    ).toBeInTheDocument()
    expect(form.send).toBeDisabled()
    expect(form.close).toBeDisabled()
    expect(mocks.close).toHaveBeenCalledOnce()

    await form.user.click(
      screen.getByRole('button', { name: '重新读取工单详情' }),
    )
    const acknowledgement = await screen.findByRole('checkbox', {
      name: '我已核对当前工单仍为开启状态，仍需再次提交关闭请求。',
    })
    expect(form.close).toBeDisabled()
    expect(mocks.close).toHaveBeenCalledOnce()
    await form.user.click(acknowledgement)
    expect(form.close).toBeEnabled()
  })
})

describe('Support Ticket mutation Auth invalidation', () => {
  it.each([
    ['reply', 'AUTH_FAILED'],
    ['close', 'AUTH_REQUIRED'],
  ] as const)(
    'invalidates the full session after %s %s',
    async (action, code) => {
      const mocks = installMocks()
      if (action === 'reply') mocks.reply.mockRejectedValue(apiError(code, 401))
      else mocks.close.mockRejectedValue(apiError(code, 401))
      const { queryClient, router } = renderSupport()
      const form = await openDetail()

      if (action === 'reply') {
        fireEvent.change(form.reply, { target: { value: 'reply' } })
        await form.user.click(form.send)
      } else {
        await form.user.click(form.close)
        await form.user.click(
          screen.getByRole('button', { name: '确认关闭工单' }),
        )
      }

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
    },
  )

  it('invalidates the full session when UNKNOWN Detail recovery rejects auth', async () => {
    const mocks = installMocks()
    mocks.reply.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockRejectedValueOnce(apiError('AUTH_FAILED', 401))
    const { queryClient, router } = renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'reply' } })
    await form.user.click(form.send)

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expectLoggedOut(router, queryClient)
    expect(mocks.reply).toHaveBeenCalledOnce()
  })

  it('invalidates the full session when Close Detail recovery rejects auth', async () => {
    const mocks = installMocks()
    mocks.close.mockRejectedValue(apiError('UPSTREAM_ERROR'))
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockRejectedValueOnce(apiError('AUTH_REQUIRED', 401))
    const { queryClient, router } = renderSupport()
    const form = await openDetail()
    await form.user.click(form.close)
    await form.user.click(screen.getByRole('button', { name: '确认关闭工单' }))

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expectLoggedOut(router, queryClient)
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('invalidates the full session when manual Detail recovery rejects auth', async () => {
    const mocks = installMocks()
    const queryClient = createQueryClient()
    queryClient.setDefaultOptions({
      queries: { retry: false, staleTime: 30_000 },
      mutations: { retry: false },
    })
    mocks.reply.mockRejectedValue(apiError('NETWORK_ERROR', 0))
    mocks.getDetail
      .mockResolvedValueOnce(replyableDetail)
      .mockRejectedValueOnce(apiError('UPSTREAM_ERROR'))
      .mockRejectedValueOnce(apiError('AUTH_FAILED', 401))
    const { router } = renderSupport(queryClient)
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'reply' } })
    await form.user.click(form.send)
    await screen.findByRole('button', { name: '重新读取工单详情' })
    await form.user.click(
      screen.getByRole('button', { name: '重新读取工单详情' }),
    )

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expectLoggedOut(router, queryClient)
    expect(mocks.reply).toHaveBeenCalledOnce()
  })

  it('invalidates the full session when List reconciliation rejects auth', async () => {
    const mocks = installMocks()
    mocks.getList
      .mockResolvedValueOnce([ticket])
      .mockRejectedValueOnce(apiError('AUTH_REQUIRED', 401))
    const { queryClient, router } = renderSupport()
    const form = await openDetail()
    fireEvent.change(form.reply, { target: { value: 'reply' } })
    await form.user.click(form.send)

    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expectLoggedOut(router, queryClient)
    expect(mocks.reply).toHaveBeenCalledOnce()
  })
})
