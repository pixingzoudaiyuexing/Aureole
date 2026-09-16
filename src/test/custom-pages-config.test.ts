import { describe, expect, it } from 'vitest'
import {
  customPageDefinitions,
  customPages,
  getCustomPageById,
  getEnabledCustomPages,
  getIframeCustomPageById,
  validateCustomPages,
  type CustomPage,
} from '@/config/custom-pages'
import { buildNavigationItems } from '@/config/navigation'

const validPage: CustomPage = {
  id: 'knowledge-base',
  title: '帮助中心',
  url: 'https://docs.example.com/guide?lang=zh#start',
  mode: 'iframe',
  enabled: true,
  order: 10,
  icon: 'book',
}

describe('Custom Page config', () => {
  it('keeps the committed production configuration empty', () => {
    expect(customPageDefinitions).toEqual([])
    expect(customPages).toEqual([])
  })

  it('validates a complete page and preserves its exact URL', () => {
    expect(validateCustomPages([validPage])).toEqual([validPage])
  })

  it('excludes disabled pages and sorts enabled pages deterministically', () => {
    const pages = validateCustomPages([
      { ...validPage, id: 'unordered-a', order: undefined },
      { ...validPage, id: 'ordered-b', order: 20 },
      { ...validPage, id: 'disabled', enabled: false, order: 1 },
      { ...validPage, id: 'ordered-a', order: 10 },
      { ...validPage, id: 'ordered-b-tie', order: 20 },
      { ...validPage, id: 'unordered-b', order: undefined },
    ])

    expect(getEnabledCustomPages(pages).map((page) => page.id)).toEqual([
      'ordered-a',
      'ordered-b',
      'ordered-b-tie',
      'unordered-a',
      'unordered-b',
    ])
  })

  it('uses stable ID lookup and restricts iframe lookup by state and mode', () => {
    const pages = validateCustomPages([
      validPage,
      {
        ...validPage,
        id: 'external-page',
        mode: 'external',
      },
      { ...validPage, id: 'disabled-page', enabled: false },
    ])

    expect(getCustomPageById('knowledge-base', pages)?.url).toBe(validPage.url)
    expect(getIframeCustomPageById('knowledge-base', pages)?.title).toBe(
      '帮助中心',
    )
    expect(getIframeCustomPageById('external-page', pages)).toBeNull()
    expect(getIframeCustomPageById('disabled-page', pages)).toBeNull()
    expect(getIframeCustomPageById('missing', pages)).toBeNull()
  })

  it('places enabled custom pages after core items and before Account', () => {
    const pages = validateCustomPages([
      { ...validPage, id: 'iframe-page', title: '内嵌页' },
      {
        ...validPage,
        id: 'external-page',
        title: '外部页',
        mode: 'external',
        order: 5,
      },
    ])
    const items = buildNavigationItems(pages)

    expect(items.map((item) => item.label)).toEqual([
      'Overview',
      'Subscription',
      'Plans',
      'Resources',
      'Orders',
      'Wallet',
      'Notices',
      'Support',
      'Referrals',
      '外部页',
      '内嵌页',
      'Account',
    ])
    expect(items.find((item) => item.label === '外部页')).toMatchObject({
      kind: 'custom-external',
      href: validPage.url,
    })
    expect(items.find((item) => item.label === '内嵌页')).toMatchObject({
      kind: 'custom-iframe',
      path: '/custom/iframe-page',
      to: '/custom/$customPageId',
    })
  })

  it.each([
    ['duplicate ID', [validPage, validPage], 'duplicate id'],
    ['invalid uppercase ID', [{ ...validPage, id: 'Bad-Id' }], 'id'],
    ['invalid repeated hyphen', [{ ...validPage, id: 'bad--id' }], 'id'],
    ['empty title', [{ ...validPage, title: '' }], 'title'],
    ['invalid mode', [{ ...validPage, mode: 'popup' }], 'mode'],
    ['invalid enabled', [{ ...validPage, enabled: 'yes' }], 'enabled'],
    ['invalid order', [{ ...validPage, order: 1.5 }], 'order'],
    ['invalid icon', [{ ...validPage, icon: 'remote-svg' }], 'icon'],
    ['unknown field', [{ ...validPage, html: '<b>x</b>' }], 'unknown field'],
  ])('rejects %s', (_name, value, message) => {
    expect(() => validateCustomPages(value)).toThrowError(message)
  })

  it.each([
    'http://docs.example.com',
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/page.html',
    'blob:https://docs.example.com/id',
    'ftp://docs.example.com',
    '/relative/path',
    '//docs.example.com/path',
    'not a url',
    'https://user:password@docs.example.com',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => validateCustomPages([{ ...validPage, url }])).toThrowError(
      'url',
    )
  })
})
