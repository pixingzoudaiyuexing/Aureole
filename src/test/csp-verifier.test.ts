import { describe, it, expect } from 'vitest'
// @ts-expect-error missing node types in browser tsconfig
import crypto from 'node:crypto'
// @ts-expect-error missing typings for scripts
import { verifyCspHashes } from '../../scripts/csp-verifier.js'

describe('CSP Hash Drift Verification', () => {
  const getHash = (content: string) => {
    return `'sha256-${crypto.createHash('sha256').update(content).digest('base64')}'`
  }

  const buildHeaders = (hashes: string[]) => `
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' ${hashes.join(' ')}
`

  it('CASE A: current one inline theme script + correct hash → PASS', () => {
    const inlineScript = `console.log('theme script');`
    const indexHtml = `<html><body><script>${inlineScript}</script></body></html>`
    const headersContent = buildHeaders([getHash(inlineScript)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it('CASE B: inline script content changes + old CSP hash → FAIL', () => {
    const oldScript = `console.log('theme script');`
    const newScript = `console.log('changed script');`
    const indexHtml = `<html><body><script>${newScript}</script></body></html>`
    const headersContent = buildHeaders([getHash(oldScript)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError('CSP hash mismatch')
  })

  it('CASE C: second executable inline script added + only first hash in CSP → FAIL', () => {
    const inlineScript1 = `console.log('theme script');`
    const inlineScript2 = `console.log('second script');`
    const indexHtml = `<html><body>
      <script>${inlineScript1}</script>
      <script>${inlineScript2}</script>
    </body></html>`
    const headersContent = buildHeaders([getHash(inlineScript1)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError('CSP hash mismatch')
  })

  it('CASE D: two executable inline scripts + both hashes present → PASS', () => {
    const inlineScript1 = `console.log('theme script');`
    const inlineScript2 = `console.log('second script');`
    const indexHtml = `<html><body>
      <script>${inlineScript1}</script>
      <script type="text/javascript">${inlineScript2}</script>
    </body></html>`
    const headersContent = buildHeaders([getHash(inlineScript1), getHash(inlineScript2)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it('CASE E: external <script src="..."> → does not require an inline hash', () => {
    const inlineScript = `console.log('theme script');`
    const indexHtml = `<html><body>
      <script>${inlineScript}</script>
      <script src="/assets/main.js"></script>
    </body></html>`
    const headersContent = buildHeaders([getHash(inlineScript)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it('fails if no inline scripts are found', () => {
    const indexHtml = `<html><body><script src="/assets/main.js"></script></body></html>`
    const headersContent = buildHeaders([getHash('unused')])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError('No inline scripts found in index.html, expected at least one.')
  })
})
