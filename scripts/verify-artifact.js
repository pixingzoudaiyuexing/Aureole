import { verifyCspHashes } from './csp-verifier.js'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

function walkDir(dir) {
  let results = []
  const list = fs.existsSync(dir) ? fs.readdirSync(dir) : []
  for (const file of list) {
    const full = path.join(dir, file)
    const stat = fs.statSync(full)
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(full))
    } else {
      results.push(full)
    }
  }
  return results
}

function verify() {
  const dist = 'dist'
  if (!fs.existsSync(dist)) throw new Error('dist/ missing')

  const indexHtmlPath = path.join(dist, 'index.html')
  if (!fs.existsSync(indexHtmlPath)) throw new Error('index.html missing')
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8')

  const allFiles = walkDir(dist)

  // Recursive source map detection
  const hasMap = allFiles.some((f) => f.endsWith('.map'))
  if (hasMap)
    throw new Error('Unexpected .map file found in production artifact')

  // Verify production JS/CSS hashing
  const assetsDir = path.join(dist, 'assets')
  const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : []

  const jsAssets = assets.filter((f) => f.endsWith('.js'))
  const cssAssets = assets.filter((f) => f.endsWith('.css'))
  if (jsAssets.length === 0 || cssAssets.length === 0)
    throw new Error('Missing hashed JS or CSS assets')

  // Check hash format (-hash.js)
  const hashPattern = /-[a-zA-Z0-9_-]{8,}\.(js|css)$/
  for (const file of jsAssets.concat(cssAssets)) {
    if (!hashPattern.test(file)) {
      throw new Error(`Asset file does not match hash naming format: ${file}`)
    }
  }

  const releaseJson = path.join(dist, 'release.json')
  if (!fs.existsSync(releaseJson)) throw new Error('release.json missing')
  const metadata = JSON.parse(fs.readFileSync(releaseJson, 'utf8'))

  if (!metadata.sha || !/^[0-9a-f]{40}$/.test(metadata.sha)) {
    throw new Error('Invalid release.json: missing or invalid 40-char SHA')
  }

  let headSha
  try {
    headSha = execSync('git rev-parse HEAD').toString().trim()
  } catch {
    headSha = undefined
  }
  if (headSha && metadata.sha !== headSha) {
    throw new Error(
      `release.json SHA (${metadata.sha}) does not match current Git HEAD (${headSha})`,
    )
  }

  // Check referenced assets
  const refs = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map(
    (m) => m[1],
  )
  for (const ref of refs) {
    // Vite output uses /assets/...
    let localPath = ref
    if (ref.startsWith('/')) {
      localPath = ref.slice(1)
    }
    // Only verify local files (ignoring http URLs like fonts/recaptcha)
    if (!ref.startsWith('http://') && !ref.startsWith('https://')) {
      const target = path.join(dist, localPath)
      if (!fs.existsSync(target)) {
        throw new Error(`Referenced asset missing: ${ref}`)
      }
    }
  }

  // Bounded leakage check
  for (const file of jsAssets.concat(cssAssets)) {
    const content = fs.readFileSync(path.join(dist, 'assets', file), 'utf8')
    if (content.includes('gateway.example.com')) {
      throw new Error(
        `Baked-in placeholder backend hostname (gateway.example.com) found in ${file}. Note: This check only guarantees the placeholder is absent.`,
      )
    }
  }

  const headersPath = path.join(dist, '_headers')
  if (!fs.existsSync(headersPath)) throw new Error('_headers missing in dist/')
  const headersContent = fs.readFileSync(headersPath, 'utf8')

  verifyCspHashes(indexHtml, headersContent)
  console.log('Artifact verification passed.')
}

try {
  verify()
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
