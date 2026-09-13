import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi } from '@/features/auth/auth-api'
import { ticketsApi } from '@/features/tickets/tickets-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const firstTicket = {
  id: '7',
  subject: 'Connection issue',
  priority: 'low' as const,
  status: 'open' as const,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
}

const tickets = [
  firstTicket,
  {
    ...firstTicket,
    id: '8',
    subject: 'Billing question',
    priority: 'normal' as const,
    status: 'closed' as const,
  },
  {
    ...firstTicket,
    id: '2147483647',
    subject: 'High priority ticket',
    priority: 'high' as const,
  },
]

const firstDetail = {
  ...firstTicket,
  messages: [
    {
      id: '11',
      content: 'My first message',
      fromMe: true,
      createdAt: '2026-09-13T00:10:00.000Z',
    },
    {
      id: '12',
      content: 'Support reply',
      fromMe: false,
      createdAt: '2026-09-13T00:20:00.000Z',
    },
  ],
}

function installMocks() {
  const getList = vi.spyOn(ticketsApi, 'getList').mockResolvedValue(tickets)
  const getDetail = vi
    .spyOn(ticketsApi, 'getDetail')
    .mockImplementation(async (_token, id) => ({
      ...firstDetail,
      id,
      subject:
        tickets.find((ticket) => ticket.id === id)?.subject ??
        firstDetail.subject,
    }))
  return { getList, getDetail }
}

function renderSupport() {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'token')
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: null,
      status: 'active',
    }),
  }
  const router = createAppRouter({ initialEntries: ['/support'] })
  const queryClient = createQueryClient()
  queryClient.setQueryData(['sensitive-test-data'], 'must be cleared')
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={queryClient}
    />,
  )
  return { queryClient, router }
}

describe('Support tickets page', () => {
  it('replaces the placeholder, preserves list order, and does not preload details', async () => {
    const mocks = installMocks()
    renderSupport()

    expect(
      await screen.findByRole('heading', { name: 'Support', level: 2 }),
    ).toBeInTheDocument()
    expect(screen.getByText('查看你的支持工单和回复记录。')).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Support tickets and replies will be connected after the core account experience is ready.',
      ),
    ).toBeNull()

    const first = await screen.findByText('Connection issue')
    const second = screen.getByText('Billing question')
    const third = screen.getByText('High priority ticket')
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Connection issue.*低.*处理中/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Billing question.*普通.*已关闭/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /High priority ticket.*高.*处理中/,
      }),
    ).toBeInTheDocument()
    expect(mocks.getList).toHaveBeenCalledWith('token')
    expect(mocks.getDetail).not.toHaveBeenCalled()

    for (const command of ['新建工单', '回复', '关闭工单']) {
      expect(screen.queryByRole('button', { name: command })).toBeNull()
    }
  })

  it('shows an honest empty state without a create action', async () => {
    const mocks = installMocks()
    mocks.getList.mockResolvedValue([])
    renderSupport()
    expect(await screen.findByText('暂无支持工单。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /新建/ })).toBeNull()
  })

  it('loads only the selected detail, switches tickets, and restores focus', async () => {
    const mocks = installMocks()
    renderSupport()
    const user = userEvent.setup()
    const firstTrigger = await screen.findByRole('button', {
      name: /Connection issue/,
    })

    expect(mocks.getDetail).not.toHaveBeenCalled()
    await user.click(firstTrigger)
    expect(firstTrigger).toHaveAttribute('aria-current', 'true')
    expect(
      await screen.findByRole('heading', { name: 'Connection issue' }),
    ).toBeInTheDocument()
    expect(mocks.getDetail).toHaveBeenCalledTimes(1)
    expect(mocks.getDetail).toHaveBeenLastCalledWith('token', '7')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(firstTrigger).toHaveFocus()

    const secondTrigger = screen.getByRole('button', {
      name: /Billing question/,
    })
    await user.click(secondTrigger)
    expect(
      await screen.findByRole('heading', { name: 'Billing question' }),
    ).toBeInTheDocument()
    expect(mocks.getDetail).toHaveBeenCalledTimes(2)
    expect(mocks.getDetail).toHaveBeenLastCalledWith('token', '8')

    await user.click(screen.getByRole('button', { name: '关闭工单详情' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(secondTrigger).toHaveFocus()
  })

  it('keeps the list for TICKET_NOT_FOUND and can reread list authority', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockRejectedValue(
      new ApiError({
        status: 404,
        code: 'TICKET_NOT_FOUND',
        message: 'private upstream message',
      }),
    )
    renderSupport()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: /Connection issue/ }),
    )

    expect(
      await screen.findByText('该工单不存在或已不可用。'),
    ).toBeInTheDocument()
    expect(screen.getByText('Billing question')).toBeInTheDocument()
    expect(screen.queryByText('private upstream message')).toBeNull()
    await user.click(screen.getByRole('button', { name: '重新读取工单列表' }))
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the list visible and retries an ordinary detail error', async () => {
    const mocks = installMocks()
    mocks.getDetail
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'UPSTREAM_ERROR',
          message: 'private',
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'UPSTREAM_ERROR',
          message: 'private',
        }),
      )
      .mockResolvedValueOnce(firstDetail)
    renderSupport()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: /Connection issue/ }),
    )

    expect(
      await screen.findByText('暂时无法读取工单详情。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Billing question')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('My first message')).toBeInTheDocument()
    expect(mocks.getDetail).toHaveBeenCalledTimes(3)
  })

  it('retries an ordinary list error', async () => {
    const mocks = installMocks()
    mocks.getList
      .mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'offline',
        }),
      )
      .mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'offline',
        }),
      )
      .mockResolvedValueOnce(tickets)
    renderSupport()
    const user = userEvent.setup()

    expect(
      await screen.findByText('暂时无法读取支持工单。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('Connection issue')).toBeInTheDocument()
    expect(mocks.getList).toHaveBeenCalledTimes(3)
  })

  it('renders hostile subjects/messages only as multiline wrapping text in server order', async () => {
    const mocks = installMocks()
    const hostileSubject = '<img src=x onerror=alert(1)>'
    const scriptText = '<script>window.hacked=true</script>'
    const anchorText = '<a href="javascript:alert(1)">click</a>'
    mocks.getList.mockResolvedValue([
      { ...firstTicket, subject: hostileSubject },
    ])
    mocks.getDetail.mockResolvedValue({
      ...firstDetail,
      subject: hostileSubject,
      messages: [
        { ...firstDetail.messages[0]!, content: `first line\n${scriptText}` },
        { ...firstDetail.messages[1]!, content: anchorText },
      ],
    })
    renderSupport()
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: new RegExp('img src') }),
    )

    const dialog = await screen.findByRole('dialog')
    const firstMessage = within(dialog).getByText((content) =>
      content.includes(scriptText),
    )
    const secondMessage = within(dialog).getByText(anchorText)
    expect(
      firstMessage.compareDocumentPosition(secondMessage) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(firstMessage).toHaveTextContent(`first line ${scriptText}`)
    expect(firstMessage).toHaveClass('whitespace-pre-wrap')
    expect(firstMessage).toHaveClass('[overflow-wrap:anywhere]')
    expect(within(dialog).getByText(hostileSubject)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('我的回复')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('客服的回复')).toBeInTheDocument()
    expect(dialog.querySelector('img')).toBeNull()
    expect(dialog.querySelector('script')).toBeNull()
    expect(dialog.querySelector('a')).toBeNull()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'invalidates the full session after list %s',
    async (code) => {
      const mocks = installMocks()
      mocks.getList.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const { queryClient, router } = renderSupport()

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(queryClient.getQueryData(['sensitive-test-data'])).toBeUndefined()
    },
  )

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'invalidates the full session after detail %s',
    async (code) => {
      const mocks = installMocks()
      mocks.getDetail.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const { queryClient, router } = renderSupport()
      const user = userEvent.setup()
      await user.click(
        await screen.findByRole('button', { name: /Connection issue/ }),
      )

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(queryClient.getQueryData(['sensitive-test-data'])).toBeUndefined()
    },
  )
})
