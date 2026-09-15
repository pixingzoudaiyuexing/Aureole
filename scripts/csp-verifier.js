import crypto from 'node:crypto'

function hasGenuineSrcAttribute(attrsString) {
  let i = 0
  const n = attrsString.length

  while (i < n) {
    while (i < n && /[\s]/.test(attrsString[i])) i++
    if (i >= n) break

    if (
      attrsString[i] === '=' ||
      attrsString[i] === '/' ||
      attrsString[i] === '>'
    ) {
      i++
      continue
    }

    let attrName = ''
    while (i < n && !/[\s=/>]/.test(attrsString[i])) {
      attrName += attrsString[i]
      i++
    }

    const isSrc = attrName.toLowerCase() === 'src'

    while (i < n && /[\s]/.test(attrsString[i])) i++

    if (i < n && attrsString[i] === '=') {
      i++
      while (i < n && /[\s]/.test(attrsString[i])) i++

      if (i < n) {
        if (attrsString[i] === '"' || attrsString[i] === "'") {
          const quote = attrsString[i]
          i++
          while (i < n && attrsString[i] !== quote) i++
          if (i < n) i++
        } else {
          while (i < n && !/[\s>]/.test(attrsString[i])) {
            i++
          }
        }
      }
    }

    if (isSrc) return true
  }
  return false
}

export function verifyCspHashes(indexHtml, headersContent) {
  const cspMatch = headersContent.match(/Content-Security-Policy:\s*(.*)/i)
  if (!cspMatch)
    throw new Error('Content-Security-Policy not found in _headers')
  const csp = cspMatch[1]
  const scriptSrcMatch = csp.match(/script-src\s+([^;]*)/i)
  if (!scriptSrcMatch) throw new Error('script-src directive not found in CSP')
  const scriptSrc = scriptSrcMatch[1]
  const allowedHashes = new Set(
    [...scriptSrc.matchAll(/'sha256-([a-zA-Z0-9+/=]+)'/g)].map(
      (m) => `'sha256-${m[1]}'`,
    ),
  )

  const scriptRegex = /<script([\s\S]*?)>([\s\S]*?)<\/script>/g
  const matches = [...indexHtml.matchAll(scriptRegex)]

  let inlineScriptCount = 0
  const computedHashes = new Set()

  for (const m of matches) {
    const attrs = m[1]
    const body = m[2]

    // Genuine external script has a real src attribute
    if (hasGenuineSrcAttribute(attrs)) {
      continue
    }

    // Fail closed if we cannot safely classify. For now, any script without real src= is inline executable.
    inlineScriptCount++
    const hash = crypto.createHash('sha256').update(body).digest('base64')
    const cspHash = `'sha256-${hash}'`
    computedHashes.add(cspHash)

    if (!allowedHashes.has(cspHash)) {
      throw new Error(
        `CSP hash mismatch: executable inline script with hash ${cspHash} not found in CSP script-src.`,
      )
    }
  }

  for (const allowedHash of allowedHashes) {
    if (!computedHashes.has(allowedHash)) {
      throw new Error(
        `CSP hash mismatch: stale/extra hash ${allowedHash} in CSP script-src without a matching inline script.`,
      )
    }
  }

  if (inlineScriptCount === 0) {
    throw new Error(
      'No inline scripts found in index.html, expected at least one.',
    )
  }
}
