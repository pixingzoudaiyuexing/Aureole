import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppProviders } from '@/app/providers/app-providers'
import { createQueryClient } from '@/app/providers/query-client'
import { createAppRouter } from '@/app/router/router'
import { buildNavigationItems } from '@/config/navigation'
import type { AuthApi } from '@/features/auth/auth-api'
import { helpApi, type HelpArticleSummary } from '@/features/help/help-api'
import { ApiError } from '@/lib/api/errors'

const summary: HelpArticleSummary = {
  id: '12',
  title: 'ClashBox 安装',
  category: '下载',
  updatedAt: '2026-09-26T00:00:00.000Z',
}
const currentUser = {
  email: 'member@example.com',
  expiresAt: '2030-01-01T00:00:00.000Z',
  status: 'active' as const,
}

function installMocks() {
  const categories = vi.spyOn(helpApi, 'getCategories').mockResolvedValue({
    categories: [
      { name: '下载', articleCount: 21 },
      { name: '入门', articleCount: 1 },
    ],
  })
  const list = vi
    .spyOn(helpApi, 'getArticles')
    .mockResolvedValue({ items: [summary], page: 1, pageSize: 20, total: 21 })
  const detail = vi.spyOn(helpApi, 'getArticle').mockResolvedValue({
    ...summary,
    blocks: [
      { type: 'paragraph', children: [{ type: 'text', text: '安装步骤' }] },
    ],
  })
  return { categories, list, detail }
}

function renderRoute(path = '/help', authenticated = true) {
  const authApi: AuthApi = {
    login: vi.fn(),
    getCurrentUser: vi.fn().mockImplementation(async () => {
      if (!authenticated)
        throw new ApiError({
          status: 401,
          code: 'AUTH_REQUIRED',
          message: 'No session',
        })
      return currentUser
    }),
  }
  const router = createAppRouter({ initialEntries: [path] })
  render(
    <AppProviders
      authApi={authApi}
      queryClient={createQueryClient()}
      router={router}
    />,
  )
  return router
}

describe('Help routes and page', () => {
  it('places Help between Notices and Support in authenticated navigation', async () => {
    const labels = buildNavigationItems([])
      .filter((item) => item.kind === 'internal')
      .map((item) => item.label)
    expect(
      labels.slice(labels.indexOf('Notices'), labels.indexOf('Support') + 1),
    ).toEqual(['Notices', '帮助中心', 'Support'])
    installMocks()
    renderRoute()
    expect(
      await screen.findByRole('heading', { name: '帮助中心', level: 2 }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('navigation', { name: 'Primary' })).getByRole(
        'link',
        { name: '帮助中心' },
      ),
    ).toHaveAttribute('href', '/help')
    expect(
      await screen.findByRole('link', { name: summary.title }),
    ).toHaveAttribute('href', '/help/12')
  })

  it('uses server search, category and page state, with a neutral empty result', async () => {
    const mocks = installMocks()
    const router = renderRoute()
    const user = userEvent.setup()
    await screen.findByRole('link', { name: summary.title })
    await user.type(
      screen.getByRole('searchbox', { name: '搜索文章' }),
      'Clash{Enter}',
    )
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(expect.any(String), {
        q: 'Clash',
        category: undefined,
        page: 1,
      }),
    )
    await user.click(screen.getByRole('button', { name: /下载 21/ }))
    await waitFor(() =>
      expect(mocks.list).toHaveBeenLastCalledWith(expect.any(String), {
        q: 'Clash',
        category: '下载',
        page: 1,
      }),
    )
    await user.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        page: 2,
        q: 'Clash',
        category: '下载',
      }),
    )
    mocks.list.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })
    await user.clear(screen.getByRole('searchbox', { name: '搜索文章' }))
    await user.type(
      screen.getByRole('searchbox', { name: '搜索文章' }),
      'no-matches{Enter}',
    )
    expect(await screen.findByText('没有找到相关文章。')).toBeInTheDocument()
  })

  it('opens typed article content and handles 404, 503 and retryable failures', async () => {
    const mocks = installMocks()
    const user = userEvent.setup()
    const router = renderRoute()
    await user.click(await screen.findByRole('link', { name: summary.title }))
    expect(await screen.findByText('安装步骤')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/help/12')
    mocks.detail.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'HELP_ARTICLE_NOT_FOUND',
        message: 'Missing',
      }),
    )
    await act(async () =>
      router.navigate({ to: '/help/$articleId', params: { articleId: '13' } }),
    )
    expect(
      await screen.findByText('文章不存在或不可访问。'),
    ).toBeInTheDocument()
    mocks.detail.mockRejectedValue(
      new ApiError({
        status: 503,
        code: 'HELP_UNAVAILABLE',
        message: 'Unavailable',
      }),
    )
    await act(async () =>
      router.navigate({ to: '/help/$articleId', params: { articleId: '14' } }),
    )
    expect(
      await screen.findByText(
        '内容暂时无法加载，请稍后重试。',
        {},
        { timeout: 3000 },
      ),
    ).toBeInTheDocument()
    mocks.detail.mockReset()
    mocks.detail
      .mockRejectedValueOnce(
        new ApiError({ status: 400, code: 'BAD_REQUEST', message: 'Retry' }),
      )
      .mockResolvedValueOnce({ ...summary, blocks: [] })
    await act(async () =>
      router.navigate({ to: '/help/$articleId', params: { articleId: '15' } }),
    )
    expect(await screen.findByText('暂时无法读取文章。')).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('main')).getByRole('button', { name: '重试' }),
    )
    expect(
      await screen.findByRole('heading', { name: summary.title }),
    ).toBeInTheDocument()
  })

  it('redirects anonymous users through the existing auth guard', async () => {
    installMocks()
    const router = renderRoute('/help/12', false)
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(helpApi.getArticle).not.toHaveBeenCalled()
  })

  it('keeps loading local while article browsing remains available', async () => {
    const mocks = installMocks()
    let resolveCategories!: (
      value: Awaited<ReturnType<typeof helpApi.getCategories>>,
    ) => void
    mocks.categories.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCategories = resolve
        }),
    )
    renderRoute()
    expect(await screen.findByText('正在读取分类…')).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: summary.title }),
    ).toBeInTheDocument()
    await act(async () => resolveCategories({ categories: [] }))
    expect(
      await screen.findByRole('button', { name: '全部' }),
    ).toBeInTheDocument()
  })

  it('recovers a category error without losing article browsing', async () => {
    const mocks = installMocks()
    mocks.categories.mockRejectedValueOnce(
      new ApiError({
        status: 400,
        code: 'BAD_REQUEST',
        message: 'Unavailable',
      }),
    )
    const user = userEvent.setup()
    renderRoute()
    expect(await screen.findByText('暂时无法读取分类。')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: summary.title }),
    ).toBeInTheDocument()
    await user.click(
      within(screen.getByRole('region', { name: '文章分类' })).getByRole(
        'button',
        { name: '重试' },
      ),
    )
    expect(
      await screen.findByRole('button', { name: /下载 21/ }),
    ).toBeInTheDocument()
  })
})
