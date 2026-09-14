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
import { ticketsApi } from '@/features/tickets/tickets-api'
import { ticketsQueryKeys } from '@/features/tickets/tickets-queries'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const ticket = {
  id: '7',
  subject: 'Existing ticket',
  priority: 'normal' as const,
  status: 'open' as const,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
}

const sameLookingTicket = {
  ...ticket,
  id: '99',
  subject: '  Exact subject  ',
  priority: 'high' as const,
  createdAt: '2026-09-13T02:00:00.000Z',
  updatedAt: '2026-09-13T02:00:00.000Z',
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function installMocks() {
  const getList = vi.spyOn(ticketsApi, 'getList').mockResolvedValue([ticket])
  const getDetail = vi.spyOn(ticketsApi, 'getDetail').mockResolvedValue({
    ...ticket,
    messages: [],
  })
  const create = vi
    .spyOn(ticketsApi, 'create')
    .mockResolvedValue({ created: true })
  return { create, getDetail, getList }
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

async function openCreate(user = userEvent.setup()) {
  await screen.findByText('Existing ticket')
  const trigger = screen.getByRole('button', { name: '新建工单' })
  await user.click(trigger)
  const dialog = screen.getByRole('dialog')
  return {
    dialog,
    message: within(dialog).getByRole('textbox', { name: '问题描述' }),
    priority: within(dialog).getByRole('combobox', { name: '优先级' }),
    subject: within(dialog).getByRole('textbox', { name: '主题' }),
    trigger,
    user,
  }
}

async function fillCreate(
  form: Awaited<ReturnType<typeof openCreate>>,
  values: {
    subject?: string
    priority?: 'low' | 'normal' | 'high'
    message?: string
  } = {},
) {
  await form.user.clear(form.subject)
  await form.user.type(form.subject, values.subject ?? '  Exact subject  ')
  await form.user.selectOptions(form.priority, values.priority ?? 'high')
  await form.user.clear(form.message)
  await form.user.type(
    form.message,
    values.message ?? ' first line\n<script>alert(1)</script> ',
  )
}

async function submitCreate(form: Awaited<ReturnType<typeof openCreate>>) {
  await form.user.click(
    within(form.dialog).getByRole('button', { name: '提交工单' }),
  )
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

describe('Create Support Ticket form', () => {
  it('keeps Create disabled during initial List loading and opens it after success', async () => {
    const mocks = installMocks()
    const list = deferred<(typeof ticket)[]>()
    mocks.getList.mockReturnValue(list.promise)
    renderSupport()

    const createButton = await screen.findByRole('button', {
      name: '新建工单',
    })
    expect(createButton).toBeDisabled()
    fireEvent.click(createButton)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => list.resolve([ticket]))
    await waitFor(() => expect(createButton).toBeEnabled())
  })

  it('keeps Create disabled after initial List error until List Retry succeeds', async () => {
    const mocks = installMocks()
    const listError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private list error',
    })
    mocks.getList
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(listError)
      .mockResolvedValueOnce([ticket])
    renderSupport()
    const user = userEvent.setup()

    expect(
      await screen.findByText('暂时无法读取支持工单。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    const createButton = screen.getByRole('button', { name: '新建工单' })
    expect(createButton).toBeDisabled()
    fireEvent.click(createButton)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(createButton).toBeEnabled())
    expect(mocks.getList).toHaveBeenCalledTimes(3)

    const form = await openCreate(user)
    await fillCreate(form, {
      subject: 'After List Retry',
      message: 'Explicit submission after authority recovery',
    })
    expect(mocks.create).not.toHaveBeenCalled()
    await submitCreate(form)
    expect(await screen.findByText('工单已提交。')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it('gates Create while stale cached List data is being authoritatively refetched', async () => {
    const mocks = installMocks()
    const list = deferred<(typeof ticket)[]>()
    mocks.getList.mockReturnValue(list.promise)
    const queryClient = createQueryClient()
    queryClient.setQueryData(ticketsQueryKeys.list, [ticket], { updatedAt: 0 })
    renderSupport(queryClient)

    expect(await screen.findByText('Existing ticket')).toBeInTheDocument()
    const createButton = screen.getByRole('button', { name: '新建工单' })
    expect(createButton).toBeDisabled()
    expect(mocks.getList).toHaveBeenCalledOnce()

    act(() => list.resolve([ticket]))
    await waitFor(() => expect(createButton).toBeEnabled())
  })

  it('keeps stale cached List fail-closed when its fresh refetch fails', async () => {
    const mocks = installMocks()
    const listError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private list error',
    })
    mocks.getList.mockRejectedValue(listError)
    const queryClient = createQueryClient()
    queryClient.setQueryData(ticketsQueryKeys.list, [ticket], { updatedAt: 0 })
    renderSupport(queryClient)

    expect(await screen.findByText('Existing ticket')).toBeInTheDocument()
    const createButton = screen.getByRole('button', { name: '新建工单' })
    expect(createButton).toBeDisabled()
    await waitFor(() => expect(mocks.getList).toHaveBeenCalledTimes(2), {
      timeout: 3_000,
    })
    await waitFor(() => expect(createButton).toBeDisabled())
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('opens and accepts input without POST, then cancels with focus restoration', async () => {
    const mocks = installMocks()
    renderSupport()
    const form = await openCreate()

    expect(mocks.create).not.toHaveBeenCalled()
    await fillCreate(form)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(form.subject).toHaveValue('  Exact subject  ')
    expect(form.priority).toHaveValue('high')
    expect(form.message).toHaveValue(' first line\n<script>alert(1)</script> ')
    expect(JSON.stringify(localStorage)).not.toContain('Exact subject')
    expect(JSON.stringify(sessionStorage)).not.toContain('Exact subject')
    expect(JSON.stringify(localStorage)).not.toContain('<script>')
    expect(JSON.stringify(sessionStorage)).not.toContain('<script>')
    expect(window.location.search).toBe('')
    expect(window.location.hash).toBe('')
    await form.user.click(
      within(form.dialog).getByRole('button', { name: '取消' }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(form.trigger).toHaveFocus()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('rejects empty and over-limit fields locally before POST', async () => {
    const mocks = installMocks()
    renderSupport()
    const form = await openCreate()

    await submitCreate(form)
    expect(
      within(form.dialog).getByText('请输入工单主题。'),
    ).toBeInTheDocument()
    expect(
      within(form.dialog).getByText('请输入问题描述。'),
    ).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()

    fireEvent.change(form.subject, { target: { value: 's'.repeat(256) } })
    fireEvent.change(form.message, { target: { value: 'm'.repeat(10_001) } })
    await submitCreate(form)
    expect(
      within(form.dialog).getByText('工单主题不能超过 255 个字符。'),
    ).toBeInTheDocument()
    expect(
      within(form.dialog).getByText('问题描述不能超过 10000 个字符。'),
    ).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('locks every form control and sends exactly one POST for same-tick submits', async () => {
    const mocks = installMocks()
    const pending = deferred<{ created: true }>()
    mocks.create.mockReturnValue(pending.promise)
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    const formElement = form.dialog.querySelector('form')!

    fireEvent.submit(formElement)
    fireEvent.submit(formElement)

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    expect(form.subject).toBeDisabled()
    expect(form.priority).toBeDisabled()
    expect(form.message).toBeDisabled()
    expect(
      within(form.dialog).getByRole('button', { name: '正在提交…' }),
    ).toBeDisabled()
    expect(
      within(form.dialog).getByRole('button', { name: '取消' }),
    ).toBeDisabled()
    await form.user.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    act(() => pending.resolve({ created: true }))
    expect(await screen.findByText('工单已提交。')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it('clears the form, refetches List, and never infers or opens a created Ticket', async () => {
    const mocks = installMocks()
    mocks.getList
      .mockReset()
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([sameLookingTicket, ticket])
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)

    expect(await screen.findByText('工单已提交。')).toBeInTheDocument()
    const reconciledTicket = await screen.findByRole('button', {
      name: /Exact subject/,
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.getList).toHaveBeenCalledTimes(2)
    expect(mocks.getDetail).not.toHaveBeenCalled()
    expect(reconciledTicket).not.toHaveAttribute('aria-current')
    expect(screen.queryByText(/工单编号：99/)).toBeNull()

    const reopened = await openCreate(form.user)
    expect(reopened.subject).toHaveValue('')
    expect(reopened.priority).toHaveValue('normal')
    expect(reopened.message).toHaveValue('')
  })

  it('keeps confirmed success while failing closed until manual List recovery succeeds', async () => {
    const mocks = installMocks()
    const recoveryError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private recovery failure',
    })
    mocks.getList
      .mockReset()
      .mockResolvedValueOnce([ticket])
      .mockRejectedValueOnce(recoveryError)
      .mockRejectedValueOnce(recoveryError)
      .mockResolvedValueOnce([ticket])
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)

    expect(
      await screen.findByText(
        '工单已提交，但暂时无法读取最新工单列表。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('工单已提交。')).toBeInTheDocument()
    expect(screen.queryByText('private recovery failure')).toBeNull()
    const createButton = screen.getByRole('button', { name: '新建工单' })
    expect(createButton).toBeDisabled()
    fireEvent.click(createButton)
    expect(mocks.create).toHaveBeenCalledOnce()

    await form.user.click(
      screen.getByRole('button', { name: '重新读取工单列表' }),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '新建工单' })).toBeEnabled(),
    )
    expect(mocks.getList).toHaveBeenCalledTimes(4)
    expect(mocks.create).toHaveBeenCalledOnce()
  })
})

describe('Create Support Ticket definitive errors', () => {
  it('handles TICKET_UNAVAILABLE generically and reconciles List without logout', async () => {
    const mocks = installMocks()
    mocks.create.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'TICKET_UNAVAILABLE',
        message: 'private exact eligibility reason',
      }),
    )
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)

    expect(
      await screen.findByText(
        '当前暂时无法创建新工单，请检查已有工单或账户状态。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('private exact eligibility reason')).toBeNull()
    expect(screen.queryByText(/一定|已有未关闭工单/)).toBeNull()
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledTimes(2)
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'ticket-token',
    )
    expect(screen.getByRole('button', { name: '新建工单' })).toBeEnabled()
  })

  it('fails closed after TICKET_UNAVAILABLE when List recovery fails', async () => {
    const mocks = installMocks()
    const recoveryError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private recovery failure',
    })
    mocks.create.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'TICKET_UNAVAILABLE',
        message: 'private rule',
      }),
    )
    mocks.getList
      .mockReset()
      .mockResolvedValueOnce([ticket])
      .mockRejectedValueOnce(recoveryError)
      .mockRejectedValueOnce(recoveryError)
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)

    expect(
      await screen.findByText(
        '当前工单列表暂时无法重新读取。请先恢复列表，再尝试创建工单。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建工单' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: '重新读取工单列表' }),
    ).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it('keeps TICKET_CREATE_FAILED input editable and needs a new explicit submit', async () => {
    const mocks = installMocks()
    mocks.create
      .mockRejectedValueOnce(
        new ApiError({
          status: 502,
          code: 'TICKET_CREATE_FAILED',
          message: 'private create failure',
        }),
      )
      .mockResolvedValueOnce({ created: true })
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)

    expect(
      await within(form.dialog).findByText(
        '工单提交未能完成，请确认内容后重新提交。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('private create failure')).toBeNull()
    expect(form.subject).toBeEnabled()
    expect(form.subject).toHaveValue('  Exact subject  ')
    expect(form.message).toHaveValue(' first line\n<script>alert(1)</script> ')
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledOnce()

    await submitCreate(form)
    expect(await screen.findByText('工单已提交。')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('keeps VALIDATION_ERROR input editable and hides raw error text', async () => {
    const mocks = installMocks()
    mocks.create
      .mockRejectedValueOnce(
        new ApiError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'private gateway validation detail',
        }),
      )
      .mockResolvedValueOnce({ created: true })
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)

    expect(
      await within(form.dialog).findByText(
        '工单内容无效，请检查主题、优先级和问题描述。',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText('private gateway validation detail')).toBeNull()
    expect(form.subject).toBeEnabled()
    expect(form.message).toBeEnabled()
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.getList).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(
      'ticket-token',
    )

    await form.user.type(form.subject, ' corrected')
    expect(mocks.create).toHaveBeenCalledOnce()
    await submitCreate(form)
    expect(await screen.findByText('工单已提交。')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })
})

describe('Create Support Ticket unknown-result recovery', () => {
  it('survives UNKNOWN guard loss on remount by requiring a fresh authoritative List', async () => {
    const mocks = installMocks()
    const listError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private list error',
    })
    mocks.create
      .mockRejectedValueOnce(
        new ApiError({
          status: 0,
          code: 'NETWORK_ERROR',
          message: 'private unknown',
        }),
      )
      .mockResolvedValueOnce({ created: true })
    mocks.getList
      .mockReset()
      .mockResolvedValueOnce([ticket])
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(listError)
      .mockResolvedValueOnce([ticket])
      .mockResolvedValueOnce([ticket])
    const firstMount = renderSupport()
    const firstForm = await openCreate()
    await fillCreate(firstForm)
    await submitCreate(firstForm)
    await screen.findByText(
      '当前工单列表暂时无法重新读取。请先恢复列表，暂时不要再次提交工单。',
      {},
      { timeout: 3_000 },
    )
    expect(mocks.create).toHaveBeenCalledOnce()

    firstMount.unmount()
    renderSupport(firstMount.queryClient)
    expect(
      await screen.findByText('暂时无法读取支持工单。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    const remountedCreate = screen.getByRole('button', { name: '新建工单' })
    expect(remountedCreate).toBeDisabled()
    fireEvent.click(remountedCreate)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mocks.create).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: '新建工单' })).toBeEnabled(),
      { timeout: 3_000 },
    )
    const secondForm = await openCreate(userEvent.setup())
    await fillCreate(secondForm, {
      subject: 'Explicit second attempt',
      message: 'Checked after authoritative List read',
    })
    expect(mocks.create).toHaveBeenCalledOnce()
    await submitCreate(secondForm)
    expect(await screen.findByText('工单已提交。')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })

  it('survives confirmed-success feedback loss on remount with the same List gate', async () => {
    const mocks = installMocks()
    const listError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private list error',
    })
    mocks.getList
      .mockReset()
      .mockResolvedValueOnce([ticket])
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(listError)
      .mockRejectedValueOnce(listError)
      .mockResolvedValueOnce([ticket])
    const firstMount = renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)
    await screen.findByText(
      '工单已提交，但暂时无法读取最新工单列表。',
      {},
      { timeout: 3_000 },
    )
    expect(mocks.create).toHaveBeenCalledOnce()

    firstMount.unmount()
    renderSupport(firstMount.queryClient)
    expect(
      await screen.findByText('暂时无法读取支持工单。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    const remountedCreate = screen.getByRole('button', { name: '新建工单' })
    expect(remountedCreate).toBeDisabled()
    fireEvent.click(remountedCreate)
    expect(mocks.create).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(
      () =>
        expect(screen.getByRole('button', { name: '新建工单' })).toBeEnabled(),
      { timeout: 3_000 },
    )
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it.each([
    new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'private' }),
    new ApiError({
      status: 504,
      code: 'UPSTREAM_TIMEOUT',
      message: 'private',
    }),
    new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private',
    }),
    new ApiError({
      status: 200,
      code: 'MALFORMED_RESPONSE',
      message: 'private',
    }),
    new Error('plain private exception'),
  ])(
    'keeps an ambiguous result unknown, rereads List, and guards another POST',
    async (createError) => {
      const mocks = installMocks()
      mocks.create.mockRejectedValue(createError)
      mocks.getList
        .mockReset()
        .mockResolvedValueOnce([ticket])
        .mockResolvedValueOnce([sameLookingTicket, ticket])
      renderSupport()
      const form = await openCreate()
      await fillCreate(form)
      await submitCreate(form)

      expect(
        await screen.findByText('工单提交结果暂时无法确认。'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          '已重新读取当前工单列表。请先检查列表，避免重复提交。',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText('工单已提交。')).toBeNull()
      expect(screen.queryByText(/工单提交未能完成/)).toBeNull()
      expect(screen.queryByText(/private|plain private exception/)).toBeNull()
      expect(mocks.create).toHaveBeenCalledOnce()
      expect(mocks.getList).toHaveBeenCalledTimes(2)
      expect(mocks.getDetail).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(
        screen.getByRole('button', { name: /Exact subject/ }),
      ).not.toHaveAttribute('aria-current')

      const createButton = screen.getByRole('button', { name: '新建工单' })
      expect(createButton).toBeDisabled()
      await form.user.click(
        screen.getByRole('checkbox', {
          name: '我已检查当前工单列表，确认仍需重新提交工单。',
        }),
      )
      expect(mocks.create).toHaveBeenCalledOnce()
      expect(createButton).toBeEnabled()
      await form.user.click(createButton)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(mocks.create).toHaveBeenCalledOnce()
    },
  )

  it('fails closed until manual List recovery succeeds and acknowledgement is given', async () => {
    const mocks = installMocks()
    const recoveryError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private recovery failure',
    })
    mocks.create.mockRejectedValue(
      new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: 'private',
      }),
    )
    mocks.getList
      .mockReset()
      .mockResolvedValueOnce([ticket])
      .mockRejectedValueOnce(recoveryError)
      .mockRejectedValueOnce(recoveryError)
      .mockResolvedValueOnce([ticket])
    renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)

    expect(
      await screen.findByText(
        '当前工单列表暂时无法重新读取。请先恢复列表，暂时不要再次提交工单。',
        {},
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建工单' })).toBeDisabled()
    expect(screen.queryByRole('checkbox')).toBeNull()
    await form.user.click(
      screen.getByRole('button', { name: '重新读取工单列表' }),
    )
    expect(
      await screen.findByRole('checkbox', {
        name: '我已检查当前工单列表，确认仍需重新提交工单。',
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建工单' })).toBeDisabled()
    expect(mocks.create).toHaveBeenCalledOnce()
  })

  it('clears acknowledgement after payload changes before an explicit resubmit', async () => {
    const mocks = installMocks()
    mocks.create
      .mockRejectedValueOnce(new Error('plain unknown'))
      .mockResolvedValueOnce({ created: true })
    renderSupport()
    const first = await openCreate()
    await fillCreate(first)
    await submitCreate(first)

    const pageAck = await screen.findByRole('checkbox', {
      name: '我已检查当前工单列表，确认仍需重新提交工单。',
    })
    await first.user.click(pageAck)
    expect(mocks.create).toHaveBeenCalledOnce()
    await first.user.click(screen.getByRole('button', { name: '新建工单' }))
    const dialog = screen.getByRole('dialog')
    const subject = within(dialog).getByRole('textbox', { name: '主题' })
    await first.user.type(subject, ' changed')

    const dialogAck = within(dialog).getByRole('checkbox', {
      name: '我已检查当前工单列表，确认仍需重新提交工单。',
    })
    expect(dialogAck).not.toBeChecked()
    expect(
      within(dialog).getByRole('button', { name: '提交工单' }),
    ).toBeDisabled()
    await first.user.click(dialogAck)
    expect(mocks.create).toHaveBeenCalledOnce()
    await first.user.click(
      within(dialog).getByRole('button', { name: '提交工单' }),
    )
    expect(await screen.findByText('工单已提交。')).toBeInTheDocument()
    expect(mocks.create).toHaveBeenCalledTimes(2)
  })
})

describe('Create Support Ticket Auth invalidation', () => {
  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits the session after Create POST %s',
    async (code) => {
      const mocks = installMocks()
      mocks.create.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'private auth' }),
      )
      const { queryClient, router } = renderSupport()
      const form = await openCreate()
      await fillCreate(form)
      await submitCreate(form)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
      expect(mocks.create).toHaveBeenCalledOnce()
    },
  )

  it.each(['success', 'unavailable', 'unknown'] as const)(
    'exits the session when %s reconciliation List returns AUTH_FAILED',
    async (kind) => {
      const mocks = installMocks()
      if (kind === 'unavailable') {
        mocks.create.mockRejectedValue(
          new ApiError({
            status: 409,
            code: 'TICKET_UNAVAILABLE',
            message: 'private',
          }),
        )
      } else if (kind === 'unknown') {
        mocks.create.mockRejectedValue(new Error('plain unknown'))
      }
      mocks.getList
        .mockReset()
        .mockResolvedValueOnce([ticket])
        .mockRejectedValueOnce(
          new ApiError({
            status: 401,
            code: 'AUTH_FAILED',
            message: 'private auth',
          }),
        )
      const { queryClient, router } = renderSupport()
      const form = await openCreate()
      await fillCreate(form)
      await submitCreate(form)

      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expectLoggedOut(router, queryClient)
      expect(mocks.create).toHaveBeenCalledOnce()
    },
  )

  it('exits the session when manual List recovery returns AUTH_REQUIRED', async () => {
    const mocks = installMocks()
    const recoveryError = new ApiError({
      status: 502,
      code: 'UPSTREAM_ERROR',
      message: 'private recovery failure',
    })
    mocks.create.mockRejectedValue(new Error('plain unknown'))
    mocks.getList
      .mockReset()
      .mockResolvedValueOnce([ticket])
      .mockRejectedValueOnce(recoveryError)
      .mockRejectedValueOnce(recoveryError)
      .mockRejectedValueOnce(
        new ApiError({
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'private auth',
        }),
      )
    const { queryClient, router } = renderSupport()
    const form = await openCreate()
    await fillCreate(form)
    await submitCreate(form)
    await screen.findByText(
      '当前工单列表暂时无法重新读取。请先恢复列表，暂时不要再次提交工单。',
      {},
      { timeout: 3_000 },
    )

    await form.user.click(
      screen.getByRole('button', { name: '重新读取工单列表' }),
    )
    expect(
      await screen.findByRole('heading', { name: '登录 Aureole' }),
    ).toBeInTheDocument()
    expectLoggedOut(router, queryClient)
    expect(mocks.create).toHaveBeenCalledOnce()
  })
})
