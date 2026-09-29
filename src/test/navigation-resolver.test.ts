import { describe, expect, it } from 'vitest'
import {
  buildNavigationItems,
  getNavigationPageTitle,
  resolveNavigationItems,
} from '@/config/navigation'
import type { CustomPage } from '@/features/custom-pages/custom-pages-api'
import type { NavigationData } from '@/features/navigation/navigation-api'

const pages: CustomPage[] = [
  {
    id: 'page-a',
    title: '原页面 A',
    url: 'https://docs.example.com/a',
    mode: 'iframe',
  },
  {
    id: 'page-b',
    title: '原页面 B',
    url: 'https://docs.example.com/b',
    mode: 'external',
  },
]
const core = (targetId: string, label = targetId) => ({
  kind: 'core' as const,
  targetId,
  label,
})
const custom = (itemId: string, label = itemId) => ({
  kind: 'custom-page' as const,
  itemId,
  label,
})
const data = (...items: NavigationData['items']): NavigationData => ({ items })

describe('effective navigation resolution', () => {
  it('preserves the exact legacy fallback, available Custom Pages and fixed Account last', () => {
    const expected = [
      'Overview',
      'Subscription',
      'Plans',
      'Resources',
      'Apple ID',
      'Orders',
      'Wallet',
      'Notices',
      '帮助中心',
      'Support',
      'Referrals',
      '原页面 A',
      '原页面 B',
      'Account',
    ]
    expect(buildNavigationItems(pages).map((item) => item.label)).toEqual(
      expected,
    )
    expect(
      resolveNavigationItems(null, pages).map((item) => item.label),
    ).toEqual(expected)
    expect(
      resolveNavigationItems(null, pages).some(
        (item) => item.label === '下载中心',
      ),
    ).toBe(false)
  })

  it('uses server order and label but only code-owned route and icon authority', () => {
    const items = resolveNavigationItems(
      data(
        core('dashboard', '首页'),
        custom('page-b', '外部入口'),
        core('plans', '套餐'),
        core('subscription', '订阅'),
        custom('page-a', '帮助文档'),
        core('download-center', '客户端下载'),
        core('help-center', 'TEST Help Desk'),
      ),
      pages,
    )
    expect(items.map((item) => item.label)).toEqual([
      '首页',
      '外部入口',
      '套餐',
      '订阅',
      '帮助文档',
      '客户端下载',
      'TEST Help Desk',
      'Account',
    ])
    expect(items[0]).toMatchObject({ kind: 'internal', to: '/dashboard' })
    expect(items[1]).toMatchObject({
      kind: 'custom-external',
      href: pages[1]?.url,
    })
    expect(items[4]).toMatchObject({
      kind: 'custom-iframe',
      to: '/custom/$customPageId',
      params: { customPageId: 'page-a' },
    })
    expect(items[5]).toMatchObject({ kind: 'internal', to: '/downloads' })
    expect(items.at(-1)).toMatchObject({ label: 'Account', to: '/settings' })
    expect(getNavigationPageTitle('/help', pages, items)).toBe('TEST Help Desk')
    expect(getNavigationPageTitle('/help/17', pages, items)).toBe(
      'TEST Help Desk',
    )
    expect(getNavigationPageTitle('/custom/page-a', pages, items)).toBe(
      '帮助文档',
    )
  })

  it('never revives omitted core or Custom Pages and never hides their direct routes', () => {
    const items = resolveNavigationItems(
      data(core('dashboard', 'Overview'), custom('page-a', 'A')),
      pages,
    )
    expect(items.map((item) => item.label)).toEqual([
      'Overview',
      'A',
      'Account',
    ])
    expect(getNavigationPageTitle('/support', pages, items)).toBe('Support')
    expect(getNavigationPageTitle('/help/17', pages, items)).toBe('帮助中心')
    expect(getNavigationPageTitle('/custom/page-b', pages, items)).toBe(
      'Aureole',
    )
    expect(getNavigationPageTitle('/custom/page-a', pages, items)).toBe('A')
    const hiddenIframe = [pages[0]!]
    expect(
      getNavigationPageTitle(
        '/custom/page-a',
        hiddenIframe,
        resolveNavigationItems(data(core('dashboard')), hiddenIframe),
      ),
    ).toBe('原页面 A')
  })

  it('omits temporarily unresolved Custom Pages without losing known core items', () => {
    const items = resolveNavigationItems(
      data(
        core('dashboard', 'Overview'),
        custom('missing', 'Missing'),
        core('orders', 'Orders'),
      ),
      pages,
    )
    expect(items.map((item) => item.label)).toEqual([
      'Overview',
      'Orders',
      'Account',
    ])
  })

  it('ignores future core targets without constructing a route', () => {
    const items = resolveNavigationItems(
      data(
        core('dashboard', 'Overview'),
        core('future-target', 'Future'),
        core('help-center', 'Help'),
      ),
      pages,
    )
    expect(items.map((item) => item.label)).toEqual([
      'Overview',
      'Help',
      'Account',
    ])
    expect(
      items.every(
        (item) => item.kind !== 'internal' || !item.to.includes('future'),
      ),
    ).toBe(true)
  })

  it('falls back as a whole when dashboard is absent or known identity is duplicated', () => {
    const fallback = buildNavigationItems(pages).map((item) => item.label)
    expect(
      resolveNavigationItems(data(core('orders')), pages).map(
        (item) => item.label,
      ),
    ).toEqual(fallback)
    expect(
      resolveNavigationItems(data(core('future-target')), pages).map(
        (item) => item.label,
      ),
    ).toEqual(fallback)
    expect(
      resolveNavigationItems(
        data(core('dashboard'), core('dashboard')),
        pages,
      ).map((item) => item.label),
    ).toEqual(fallback)
    expect(
      resolveNavigationItems(
        data(core('dashboard'), custom('page-a'), custom('page-a')),
        pages,
      ).map((item) => item.label),
    ).toEqual(fallback)
  })
})
