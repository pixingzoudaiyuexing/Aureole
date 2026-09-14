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

  it('validates public/_headers', async () => {
    const content = await fs.readFile('./public/_headers', 'utf-8')

    // /assets/* caching
    expect(content).toMatch(
      /\/assets\/\*[\s\S]+?Cache-Control:\s*public,\s*max-age=31536000,\s*immutable/i,
    )

    // /release.json caching
    expect(content).toMatch(
      /\/release\.json[\s\S]+?Cache-Control:\s*public,\s*max-age=0,\s*must-revalidate/i,
    )

    // /* caching (index.html is covered by this)
    expect(content).toMatch(
      /\/\*[\s\S]+?Cache-Control:\s*public,\s*max-age=0,\s*must-revalidate/i,
    )

    // Security Headers
    expect(content).toMatch(/X-Content-Type-Options:\s*nosniff/i)
    expect(content).toMatch(
      /Referrer-Policy:\s*strict-origin-when-cross-origin/i,
    )
    expect(content).toMatch(
      /Strict-Transport-Security:\s*max-age=31536000\b(?!.*includeSubDomains)(?!.*preload)/i,
    )
    expect(content).toMatch(
      /Permissions-Policy:\s*camera=\(\),\s*microphone=\(\),\s*geolocation=\(\)/i,
    )

    // CSP
    expect(content).toMatch(/Content-Security-Policy:/i)
    const cspMatch = content.match(/Content-Security-Policy:\s*(.*)/i)
    expect(cspMatch).toBeDefined()
    const csp = cspMatch![1]

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("connect-src 'self'")
    expect(csp).toContain("script-src 'self' 'sha256-")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain("img-src 'self' data: https:")
    expect(csp).toContain("font-src 'self' data:")
    expect(csp).toContain("frame-src 'none'")

    // Should NOT contain unsafe things
    expect(csp).not.toContain("script-src 'unsafe-inline'")
    expect(csp).not.toContain('script-src *')
    expect(csp).not.toContain('connect-src *')
    expect(csp).not.toContain('unsafe-eval')
  })
})
