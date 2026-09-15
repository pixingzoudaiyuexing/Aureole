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

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'CSP hash mismatch',
    )
  })

  it('CASE C: second executable inline script added + only first hash in CSP → FAIL', () => {
    const inlineScript1 = `console.log('theme script');`
    const inlineScript2 = `console.log('second script');`
    const indexHtml = `<html><body>
      <script>${inlineScript1}</script>
      <script>${inlineScript2}</script>
    </body></html>`
    const headersContent = buildHeaders([getHash(inlineScript1)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'CSP hash mismatch',
    )
  })

  it('CASE D: two executable inline scripts + both hashes present → PASS', () => {
    const inlineScript1 = `console.log('theme script');`
    const inlineScript2 = `console.log('second script');`
    const indexHtml = `<html><body>
      <script>${inlineScript1}</script>
      <script type="text/javascript">${inlineScript2}</script>
    </body></html>`
    const headersContent = buildHeaders([
      getHash(inlineScript1),
      getHash(inlineScript2),
    ])

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

  it('CASE F: data-src inline script with no corresponding hash → MUST FAIL', () => {
    const inlineScript1 = `console.log('theme script');`
    const fakeScript = `console.log('inline');`
    const indexHtml = `<html><body>
      <script>${inlineScript1}</script>
      <script data-src="/fake.js">${fakeScript}</script>
    </body></html>`
    const headersContent = buildHeaders([getHash(inlineScript1)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'CSP hash mismatch',
    )
  })

  it('CASE G: data-src inline script with correct hash → PASS', () => {
    const fakeScript = `console.log('inline');`
    const indexHtml = `<html><body>
      <script data-src="/fake.js">${fakeScript}</script>
    </body></html>`
    const headersContent = buildHeaders([getHash(fakeScript)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it('CASE H: genuine external script with SRC=... → treated as external script', () => {
    const inlineScript = `console.log('theme script');`
    const indexHtml = `<html><body>
      <script>${inlineScript}</script>
      <script SRC = "/assets/main.js"></script>
    </body></html>`
    const headersContent = buildHeaders([getHash(inlineScript)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it('CASE I: x-src inline script with no corresponding hash → MUST FAIL', () => {
    const fakeScript = `console.log('inline');`
    const indexHtml = `<html><body>
      <script x-src="/fake.js">${fakeScript}</script>
    </body></html>`
    // Missing hash
    const headersContent = buildHeaders([])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'CSP hash mismatch',
    )
  })

  it('CASE J: one inline executable script with one correct hash and one stale hash → FAIL', () => {
    const inlineScript = `console.log('theme script');`
    const indexHtml = `<html><body><script>${inlineScript}</script></body></html>`
    const staleHash = `'sha256-invalidhash='`
    const headersContent = buildHeaders([getHash(inlineScript), staleHash])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'stale/extra hash',
    )
  })

  it('CASE K: two inline executable scripts and exactly two matching hashes → PASS', () => {
    const inlineScript1 = `console.log('theme script');`
    const inlineScript2 = `console.log('second script');`
    const indexHtml = `<html><body>
      <script>${inlineScript1}</script>
      <script>${inlineScript2}</script>
    </body></html>`
    // Reverse order
    const headersContent = buildHeaders([
      getHash(inlineScript2),
      getHash(inlineScript1),
    ])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it('CASE L: data-note=" src=" without inline hash → FAIL', () => {
    const fakeScript = `console.log("inline")`
    const indexHtml = `<html><body><script data-note=" src=">${fakeScript}</script></body></html>`
    const headersContent = buildHeaders([])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'CSP hash mismatch',
    )
  })

  it('CASE M: data-note=" src=" with correct inline hash → PASS', () => {
    const fakeScript = `console.log("inline")`
    const indexHtml = `<html><body><script data-note=" src=">${fakeScript}</script></body></html>`
    const headersContent = buildHeaders([getHash(fakeScript)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it('CASE N: title="src=/fake.js" without hash → FAIL', () => {
    const fakeScript = `console.log("inline")`
    const indexHtml = `<html><body><script title="src=/fake.js">${fakeScript}</script></body></html>`
    const headersContent = buildHeaders([])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'CSP hash mismatch',
    )
  })

  it('CASE O: async src = ... → genuine external → no inline hash required', () => {
    const inlineScript = `console.log('theme script');`
    const indexHtml = `<html><body>
      <script>${inlineScript}</script>
      <script async src = '/assets/main.js'></script>
    </body></html>`
    const headersContent = buildHeaders([getHash(inlineScript)])

    expect(() => verifyCspHashes(indexHtml, headersContent)).not.toThrow()
  })

  it("CASE P: data-x='something src=/fake.js' → inline → missing hash FAIL", () => {
    const fakeScript = `console.log("inline")`
    const indexHtml = `<html><body><script data-x='something src=/fake.js'>${fakeScript}</script></body></html>`
    const headersContent = buildHeaders([])

    expect(() => verifyCspHashes(indexHtml, headersContent)).toThrowError(
      'CSP hash mismatch',
    )
  })
})
