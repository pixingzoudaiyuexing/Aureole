import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HelpArticleContent } from '@/features/help/help-content'
import type { HelpBlock } from '@/features/help/help-api'

describe('Help typed content', () => {
  it('renders headings, paragraph, lists and inline emphasis as React nodes', () => {
    const blocks: HelpBlock[] = [
      { type: 'heading', level: 1, children: [{ type: 'text', text: '一级' }] },
      { type: 'heading', level: 2, children: [{ type: 'text', text: '二级' }] },
      { type: 'heading', level: 3, children: [{ type: 'text', text: '三级' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: '<script>bad()</script>' },
          { type: 'break' },
          { type: 'strong', children: [{ type: 'text', text: '粗体' }] },
          { type: 'emphasis', children: [{ type: 'text', text: '斜体' }] },
        ],
      },
      { type: 'unordered-list', items: [[{ type: 'text', text: '第一项' }]] },
      { type: 'ordered-list', items: [[{ type: 'text', text: '第二项' }]] },
    ]
    const { container } = render(<HelpArticleContent blocks={blocks} />)
    expect(
      screen.getByRole('heading', { name: '一级', level: 1 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '二级', level: 2 }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: '三级', level: 3 }),
    ).toBeInTheDocument()
    expect(screen.getByText('<script>bad()</script>')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(screen.getByText('粗体').parentElement?.tagName).toBe('STRONG')
    expect(screen.getByText('斜体').parentElement?.tagName).toBe('EM')
  })

  it('renders only safe HTTPS links, images and resolved downloads', () => {
    const blocks: HelpBlock[] = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            href: 'https://docs.example/path',
            children: [{ type: 'text', text: '文档' }],
          },
          {
            type: 'link',
            href: 'javascript:alert(1)',
            children: [{ type: 'text', text: '危险' }],
          },
          { type: 'image', src: 'https://images.example/p.png', alt: '示意图' },
          { type: 'image', src: 'data:image/png;base64,AA', alt: '危险图' },
          {
            type: 'download',
            itemId: 'one',
            slot: 'primary',
            label: 'ClashBox',
            href: 'https://downloads.example/one',
          },
          {
            type: 'download',
            itemId: 'one',
            slot: 'backup',
            label: '备用下载',
            href: 'https://backup.example/one',
          },
          {
            type: 'download',
            itemId: 'one',
            slot: 'primary',
            label: '不安全下载',
            href: 'https://user:pass@bad.example/one',
          },
        ],
      },
    ]
    const { container } = render(<HelpArticleContent blocks={blocks} />)
    expect(screen.getByRole('link', { name: '文档' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    )
    expect(screen.queryByRole('link', { name: '危险' })).toBeNull()
    expect(screen.getByRole('img', { name: '示意图' })).toHaveAttribute(
      'loading',
      'lazy',
    )
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'ClashBox' })).toHaveAttribute(
      'href',
      'https://downloads.example/one',
    )
    expect(screen.getByRole('link', { name: '备用下载' })).toHaveAttribute(
      'href',
      'https://backup.example/one',
    )
    expect(screen.queryByRole('link', { name: '不安全下载' })).toBeNull()
    expect(within(container).queryByText('暂不可用')).toBeNull()
    fireEvent.error(screen.getByRole('img', { name: '示意图' }))
    expect(screen.queryByRole('img', { name: '示意图' })).toBeNull()
    expect(screen.getByText('示意图')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ClashBox' })).toBeInTheDocument()
  })
})
