import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { noticesApi } from '@/features/notices/notices-api'
import { SafeNoticeHtml } from '@/features/notices/safe-notice-html'
import { apiClient } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const token = 'opaque-token'
const summary = {
  id: '7',
  title: '维护通知',
  tags: ['维护'],
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T01:00:00.000Z',
}

describe('Notices API', () => {
  it('builds exact list URLs, preserves order, and strips additive fields', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        items: [
          { ...summary, future: true },
          { ...summary, id: '8', title: 'Second' },
        ],
        page: 2,
        pageSize: 20,
        total: 22,
        future: true,
      })
    await expect(noticesApi.getList(token, 2, 20)).resolves.toEqual({
      items: [summary, { ...summary, id: '8', title: 'Second' }],
      page: 2,
      pageSize: 20,
      total: 22,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/notices?page=2&pageSize=20', {
      method: 'GET',
      accessToken: token,
    })
  })

  it('preserves validated detail HTML as opaque data and builds exact path', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        ...summary,
        content: '<p onclick="bad()">正文</p>',
        future: true,
      })
    await expect(noticesApi.getDetail(token, '7')).resolves.toEqual({
      ...summary,
      content: '<p onclick="bad()">正文</p>',
    })
    expect(request).toHaveBeenCalledWith('/api/v1/notices/7', {
      method: 'GET',
      accessToken: token,
    })
  })

  it('accepts empty page and empty tags', async () => {
    const request = vi
      .spyOn(apiClient, 'authenticatedRequest')
      .mockResolvedValue({
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
      })
    await expect(noticesApi.getList(token, 1, 20)).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    })
    expect(request).toHaveBeenCalledWith('/api/v1/notices?page=1&pageSize=20', {
      method: 'GET',
      accessToken: token,
    })
  })

  it.each(['0', '2147483648', 'not-an-id'])(
    'rejects invalid detail id %s before requesting',
    async (id) => {
      const request = vi.spyOn(apiClient, 'authenticatedRequest')
      await expect(noticesApi.getDetail(token, id)).rejects.toBeDefined()
      expect(request).not.toHaveBeenCalled()
    },
  )

  it.each([
    { ...summary, id: '0' },
    { ...summary, id: '2147483648' },
    { ...summary, title: '' },
    { ...summary, title: 'x'.repeat(256) },
    { ...summary, tags: Array(256).fill('x') },
    { ...summary, tags: ['x'.repeat(256)] },
    { ...summary, createdAt: 'bad' },
    { ...summary, updatedAt: 'bad' },
  ])('rejects malformed summary fields', async (item) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
      items: [item],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    await expect(noticesApi.getList(token, 1, 20)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    { items: [], page: 0, pageSize: 20, total: 0 },
    { items: [], page: 1, pageSize: 101, total: 0 },
    { items: [], page: 1, pageSize: 20, total: -1 },
    { items: [], page: 1, pageSize: 20, total: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects malformed pagination', async (payload) => {
    vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
    await expect(noticesApi.getList(token, 1, 20)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    } satisfies Partial<ApiError>)
  })

  it.each([
    { items: [], page: 2, pageSize: 20, total: 0 },
    { items: [], page: 1, pageSize: 19, total: 0 },
  ])(
    'rejects pagination metadata that differs from the request',
    async (payload) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue(payload)
      await expect(noticesApi.getList(token, 1, 20)).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>)
    },
  )

  it.each(['', 'x'.repeat(65_536)])(
    'rejects invalid detail content',
    async (content) => {
      vi.spyOn(apiClient, 'authenticatedRequest').mockResolvedValue({
        ...summary,
        content,
      })
      await expect(noticesApi.getDetail(token, '7')).rejects.toMatchObject({
        code: 'MALFORMED_RESPONSE',
      } satisfies Partial<ApiError>)
    },
  )
})

describe('SafeNoticeHtml', () => {
  it('removes hostile elements, attributes, and URI schemes', () => {
    render(
      <SafeNoticeHtml
        html={
          '<script>bad()</script><img src="https://tracker.example/x" onerror="bad()"><iframe src="https://evil.example"></iframe><form><input></form><svg onload="bad()"></svg><p id="x" class="x" title="unsafe" href="https://example.com" style="position:fixed" onclick="bad()">safe</p><a href="javascript:bad()" target="_blank" onmouseover="bad()">javascript</a><a href="data:text/html,bad">data</a><a href="vbscript:bad()">vbscript</a><a href="file:///etc/passwd">file</a>'
        }
      />,
    )
    expect(screen.getByText('safe')).toBeInTheDocument()
    for (const selector of [
      'script',
      'img',
      'iframe',
      'form',
      'input',
      'svg',
      'style',
    ])
      expect(document.querySelector(selector)).toBeNull()
    const paragraph = screen.getByText('safe')
    expect(paragraph).not.toHaveAttribute('style')
    expect(paragraph).not.toHaveAttribute('class')
    expect(paragraph).not.toHaveAttribute('id')
    expect(paragraph).not.toHaveAttribute('onclick')
    expect(paragraph).not.toHaveAttribute('href')
    expect(paragraph).not.toHaveAttribute('title')
    for (const link of document.querySelectorAll('a')) {
      expect(link).not.toHaveAttribute('href')
      expect(link).not.toHaveAttribute('target')
      expect(link).not.toHaveAttribute('onmouseover')
    }
  })

  it('preserves legitimate semantic content and safe links', () => {
    render(
      <SafeNoticeHtml
        html={
          '<h2>维护通知</h2><p>预计维护 30 分钟。</p><ul><li>节点 A</li></ul><strong>重要说明</strong><a href="https://example.com" title="详情" target="_blank">详情</a><pre><code>long code</code></pre>'
        }
      />,
    )
    expect(
      screen.getByRole('heading', { name: '维护通知' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('list')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '详情' })).toHaveAttribute(
      'href',
      'https://example.com',
    )
    expect(screen.getByRole('link', { name: '详情' })).not.toHaveAttribute(
      'target',
    )
  })

  it('shows a neutral state when nothing safe remains', () => {
    render(
      <SafeNoticeHtml
        html={
          '<img src="https://tracker.example/x"><iframe src="https://evil.example"></iframe>'
        }
      />,
    )
    expect(
      screen.getByText('公告正文没有可安全展示的内容。'),
    ).toBeInTheDocument()
  })
})
