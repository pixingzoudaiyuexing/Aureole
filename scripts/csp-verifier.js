import crypto from 'node:crypto'

function getCsp(headersContent) {
  const cspMatch = headersContent.match(/Content-Security-Policy:\s*(.*)/i)
  if (!cspMatch)
    throw new Error('Content-Security-Policy not found in _headers')
  return cspMatch[1]
}

function getDirectiveSources(csp, name) {
  const directive = csp
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(`${name.toLowerCase()} `))
  if (!directive) throw new Error(`${name} directive not found in CSP`)
  return directive.split(/\s+/).slice(1)
}

function requireExactDirective(csp, name, expectedSources) {
  const sources = getDirectiveSources(csp, name)
  if (
    sources.length !== expectedSources.length ||
    expectedSources.some((source) => !sources.includes(source))
  ) {
    throw new Error(
      `${name} must be exactly ${expectedSources.join(' ')}, received ${sources.join(' ')}`,
    )
  }
}

export function verifyCspPolicy(headersContent) {
  const csp = getCsp(headersContent)
  requireExactDirective(csp, 'default-src', ["'self'"])
  requireExactDirective(csp, 'base-uri', ["'self'"])
  requireExactDirective(csp, 'object-src', ["'none'"])
  requireExactDirective(csp, 'frame-ancestors', ["'none'"])
  requireExactDirective(csp, 'form-action', ["'self'"])
  requireExactDirective(csp, 'connect-src', ["'self'"])

  const frameSources = getDirectiveSources(csp, 'frame-src')
  if (!frameSources.includes('https:')) {
    throw new Error('frame-src must allow https:')
  }
  for (const unsafeSource of ["'none'", '*', 'http:', 'data:', 'blob:']) {
    if (frameSources.includes(unsafeSource)) {
      throw new Error(`frame-src must not allow ${unsafeSource}`)
    }
  }
  if (frameSources.length !== 1) {
    throw new Error('frame-src must be exactly https:')
  }

  const scriptSources = getDirectiveSources(csp, 'script-src')
  if (!scriptSources.includes("'self'")) {
    throw new Error("script-src must include 'self'")
  }
  for (const unsafeSource of ['*', "'unsafe-inline'", "'unsafe-eval'"]) {
    if (scriptSources.includes(unsafeSource)) {
      throw new Error(`script-src must not allow ${unsafeSource}`)
    }
  }
  return csp
}

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
  const csp = verifyCspPolicy(headersContent)
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
