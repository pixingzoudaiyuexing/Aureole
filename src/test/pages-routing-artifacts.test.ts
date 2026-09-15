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

    const parseHeaders = (text: string) => {
      const lines = text.split('\n')
      const blocks = new Map<string, string[]>()
      let currentPath = ''

      for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue
        if (!line.startsWith(' ') && !line.startsWith('\t')) {
          currentPath = line.trim()
          if (!blocks.has(currentPath)) blocks.set(currentPath, [])
        } else if (currentPath) {
          blocks.get(currentPath)!.push(line.trim())
        }
      }
      return blocks
    }

    const blocks = parseHeaders(content)

    // Check /assets/*
    const assetsBlock = blocks.get('/assets/*')
    expect(assetsBlock).toBeDefined()
    const assetsCacheControl = assetsBlock!.filter((l) =>
      l.toLowerCase().startsWith('cache-control:'),
    )
    expect(assetsCacheControl.length).toBe(1)
    expect(assetsCacheControl[0]).toMatch(
      /public,\s*max-age=31536000,\s*immutable/i,
    )

    // Check /release.json
    const releaseBlock = blocks.get('/release.json')
    expect(releaseBlock).toBeDefined()
    const releaseCacheControl = releaseBlock!.filter((l) =>
      l.toLowerCase().startsWith('cache-control:'),
    )
    expect(releaseCacheControl.length).toBe(1)
    expect(releaseCacheControl[0]).toMatch(
      /public,\s*max-age=0,\s*must-revalidate/i,
    )

    // Check /index.html
    const indexBlock = blocks.get('/index.html')
    expect(indexBlock).toBeDefined()
    const indexCacheControl = indexBlock!.filter((l) =>
      l.toLowerCase().startsWith('cache-control:'),
    )
    expect(indexCacheControl.length).toBe(1)
    expect(indexCacheControl[0]).toMatch(
      /public,\s*max-age=0,\s*must-revalidate/i,
    )

    // Check /*
    const globalBlock = blocks.get('/*')
    expect(globalBlock).toBeDefined()
    const globalCacheControl = globalBlock!.filter((l) =>
      l.toLowerCase().startsWith('cache-control:'),
    )
    expect(globalCacheControl.length).toBe(0) // MUST NOT contain Cache-Control

    const globalHeadersStr = globalBlock!.join('\n')
    expect(globalHeadersStr).toMatch(/X-Content-Type-Options:\s*nosniff/i)
    expect(globalHeadersStr).toMatch(
      /Referrer-Policy:\s*strict-origin-when-cross-origin/i,
    )
    expect(globalHeadersStr).toMatch(
      /Strict-Transport-Security:\s*max-age=31536000\b(?!.*includeSubDomains)(?!.*preload)/i,
    )
    expect(globalHeadersStr).toMatch(
      /Permissions-Policy:\s*camera=\(\),\s*microphone=\(\),\s*geolocation=\(\)/i,
    )

    // Detect Future Broad Cache Overlap
    // Fail if another broad wildcard rule is introduced that can apply Cache-Control to /assets/*
    for (const [path, headers] of blocks.entries()) {
      if (
        path !== '/assets/*' &&
        path !== '/release.json' &&
        path !== '/index.html' &&
        path !== '/*'
      ) {
        const hasCacheControl = headers.some((l) =>
          l.toLowerCase().startsWith('cache-control:'),
        )
        if (hasCacheControl && path.includes('*')) {
          // Simplistic overlap check for /assets/*
          const cleanPath = path.replace('*', '')
          if ('/assets/foo'.startsWith(cleanPath) || cleanPath === '/') {
            throw new Error(
              `Broad wildcard rule '${path}' overlaps with /assets/* and defines Cache-Control.`,
            )
          }
        }
      }
    }

    // CSP
    expect(globalHeadersStr).toMatch(/Content-Security-Policy:/i)
    const cspMatch = globalHeadersStr.match(/Content-Security-Policy:\s*(.*)/i)
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
