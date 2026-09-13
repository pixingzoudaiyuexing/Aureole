import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import type { AuthApi } from '@/features/auth/auth-api'
import { noticesApi } from '@/features/notices/notices-api'
import { subscriptionApi } from '@/features/subscription/subscription-api'
import { ApiError } from '@/lib/api/errors'
import { AUTH_SESSION_STORAGE_KEY } from '@/lib/auth/credential-storage'

const summary = {
  id: '7',
  title: 'First Notice',
  tags: ['maintenance', 'service'],
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
}
const overview = {
  product: { id: '7', name: 'Pro Plan' },
  expiresAt: null,
  traffic: { uploadedBytes: 0, downloadedBytes: 0, allowanceBytes: 0 },
  deviceLimit: null,
  activeDevices: 0,
  resetDay: null,
  renewalAllowed: false,
}

function installMocks() {
  const getList = vi.spyOn(noticesApi, 'getList').mockResolvedValue({
    items: [summary, { ...summary, id: '8', title: 'Second Notice', tags: [] }],
    page: 1,
    pageSize: 20,
    total: 21,
  })
  const getDetail = vi.spyOn(noticesApi, 'getDetail').mockResolvedValue({
    ...summary,
    content:
      '<h2>Safe heading</h2><p>Safe body</p><img src="https://tracker.example/x"><script>bad()</script>',
  })
  vi.spyOn(subscriptionApi, 'getOverview').mockResolvedValue(overview)
  return { getList, getDetail }
}

function renderRoute(path: '/notices' | '/dashboard') {
  window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'token')
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue({
      email: 'member@example.com',
      expiresAt: null,
      status: 'active',
    }),
  }
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      router={router}
      authApi={authApi}
      queryClient={createQueryClient()}
    />,
  )
  return router
}

describe('Notices page', () => {
  it('renders server order, tags, dates and pagination', async () => {
    const mocks = installMocks()
    renderRoute('/notices')
    const user = userEvent.setup()
    const first = await screen.findByText('First Notice')
    const second = screen.getByText('Second Notice')
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByText('maintenance')).toBeInTheDocument()
    expect(screen.getAllByText(/2026年9月13日/)).toHaveLength(2)
    expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    mocks.getList.mockResolvedValueOnce({
      items: [],
      page: 2,
      pageSize: 20,
      total: 21,
    })
    await user.click(screen.getByRole('button', { name: '下一页' }))
    expect(await screen.findByText('第 2 / 2 页')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
    expect(mocks.getList).toHaveBeenLastCalledWith('token', 2, 20)
  })

  it('shows honest empty state', async () => {
    const mocks = installMocks()
    mocks.getList.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })
    renderRoute('/notices')
    expect(await screen.findByText('当前没有公告。')).toBeInTheDocument()
  })

  it('disables both pagination directions on a single page', async () => {
    const mocks = installMocks()
    mocks.getList.mockResolvedValue({
      items: [summary],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    renderRoute('/notices')
    await screen.findByText('First Notice')
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  })

  it('loads detail only after selection, sanitizes it, and closes with focus restoration', async () => {
    const mocks = installMocks()
    renderRoute('/notices')
    const user = userEvent.setup()
    const trigger = await screen.findByRole('button', { name: /First Notice/ })
    expect(mocks.getDetail).not.toHaveBeenCalled()
    await user.click(trigger)
    expect(
      await screen.findByRole('heading', { name: 'Safe heading' }),
    ).toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('script')).toBeNull()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
    await user.click(trigger)
    await screen.findByRole('heading', { name: 'Safe heading' })
    await user.click(screen.getByRole('button', { name: '关闭公告' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger).toHaveFocus()
  })

  it('keeps list available for detail 404', async () => {
    const mocks = installMocks()
    mocks.getDetail.mockRejectedValue(
      new ApiError({
        status: 404,
        code: 'NOTICE_NOT_FOUND',
        message: 'missing',
      }),
    )
    renderRoute('/notices')
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: /First Notice/ }),
    )
    expect(
      await screen.findByText('该公告不存在或已不可用。'),
    ).toBeInTheDocument()
    expect(screen.getByText('Second Notice')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('keeps list available while retrying an ordinary detail error', async () => {
    const mocks = installMocks()
    mocks.getDetail
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockRejectedValueOnce(
        new ApiError({ status: 502, code: 'UPSTREAM_ERROR', message: 'bad' }),
      )
      .mockResolvedValueOnce({ ...summary, content: '<p>Recovered</p>' })
    renderRoute('/notices')
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: /First Notice/ }),
    )
    expect(
      await screen.findByText('暂时无法读取公告详情。', {}, { timeout: 3_000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Second Notice')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('Recovered')).toBeInTheDocument()
  })

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits after detail %s',
    async (code) => {
      const mocks = installMocks()
      mocks.getDetail.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const router = renderRoute('/notices')
      const user = userEvent.setup()
      await user.click(
        await screen.findByRole('button', { name: /First Notice/ }),
      )
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
      expect(screen.queryByText('Safe body')).toBeNull()
    },
  )

  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits after list %s',
    async (code) => {
      const mocks = installMocks()
      mocks.getList.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const router = renderRoute('/notices')
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
      expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
    },
  )
})

describe('Dashboard latest notice', () => {
  it('uses page 1 size 1 summary only and preserves Subscription', async () => {
    const mocks = installMocks()
    renderRoute('/dashboard')
    expect(await screen.findByText('Pro Plan')).toBeInTheDocument()
    expect(screen.getByText('First Notice')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /查看全部公告/ })).toHaveAttribute(
      'href',
      '/notices',
    )
    expect(mocks.getList).toHaveBeenCalledWith('token', 1, 1)
    expect(mocks.getDetail).not.toHaveBeenCalled()
    expect(screen.queryByText(/未读|重要/)).toBeNull()
  })
  it('isolates empty and ordinary notice error from Subscription', async () => {
    const mocks = installMocks()
    mocks.getList.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 1,
      total: 0,
    })
    renderRoute('/dashboard')
    expect(await screen.findByText('暂无公告。')).toBeInTheDocument()
    expect(screen.getByText('Pro Plan')).toBeInTheDocument()
  })
  it('shows retry while Subscription remains visible', async () => {
    const mocks = installMocks()
    mocks.getList
      .mockRejectedValueOnce(
        new ApiError({
          status: 200,
          code: 'MALFORMED_RESPONSE',
          message: 'bad',
        }),
      )
      .mockResolvedValueOnce({
        items: [summary],
        page: 1,
        pageSize: 1,
        total: 1,
      })
    renderRoute('/dashboard')
    const user = userEvent.setup()
    expect(
      await screen.findByText('暂时无法读取最新公告。'),
    ).toBeInTheDocument()
    expect(screen.getByText('Pro Plan')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('First Notice')).toBeInTheDocument()
  })
  it.each(['AUTH_REQUIRED', 'AUTH_FAILED'])(
    'exits Dashboard after notice %s',
    async (code) => {
      const mocks = installMocks()
      mocks.getList.mockRejectedValue(
        new ApiError({ status: 401, code, message: 'auth' }),
      )
      const router = renderRoute('/dashboard')
      expect(
        await screen.findByRole('heading', { name: '登录 Aureole' }),
      ).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/login')
    },
  )
})
