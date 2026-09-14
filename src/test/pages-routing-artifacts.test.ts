import { describe, it, expect } from 'vitest'
// @ts-expect-error missing node types in browser tsconfig
import fs from 'node:fs/promises'

describe('Cloudflare Pages Routing Artifacts', () => {
  it('validates public/404.html exists and is non-empty', async () => {
    const content = await fs.readFile('./public/404.html', 'utf-8')
    expect(content.trim().length).toBeGreaterThan(0)
  })

  it('validates public/_routes.json', async () => {
    const content = await fs.readFile('./public/_routes.json', 'utf-8')
    const json = JSON.parse(content)

    expect(json.version).toBe(1)
    expect(json.include).toEqual(['/api/v1', '/api/v1/*'])
    expect(json.exclude).toBeDefined()
  })

  it('validates public/_redirects', async () => {
    const content = await fs.readFile('./public/_redirects', 'utf-8')

    // Must NOT contain wildcard
    expect(content).not.toMatch(/\/\*\s+\/index\.html\s+200/)

    const expectedRoutes = [
      '/dashboard',
      '/notices',
      '/orders',
      '/plans',
      '/referrals',
      '/resources',
      '/settings',
      '/subscription',
      '/support',
      '/wallet',
      '/forgot-password',
      '/login',
      '/register',
    ]

    const lines = content
      .split('\n')
      .map((line: string) => line.trim())
      .filter(Boolean)

    for (const route of expectedRoutes) {
      const match = lines.find(
        (line: string) =>
          line.startsWith(route + ' ') && line.includes('/index.html 200'),
      )
      expect(match).toBeDefined()
    }
  })
})
