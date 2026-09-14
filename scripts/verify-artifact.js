import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

function verify() {
  const dist = 'dist'
  if (!fs.existsSync(dist)) throw new Error('dist/ missing')

  const indexHtmlPath = path.join(dist, 'index.html')
  if (!fs.existsSync(indexHtmlPath)) throw new Error('index.html missing')

  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8')

  const assetsDir = path.join(dist, 'assets')
  const assets = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : []

  const hasJs = assets.some((f) => f.endsWith('.js'))
  const hasCss = assets.some((f) => f.endsWith('.css'))
  if (!hasJs || !hasCss) throw new Error('Missing hashed JS or CSS assets')

  const hasMap = assets.some((f) => f.endsWith('.map'))
  if (hasMap)
    throw new Error('Unexpected .map file found in production artifact')

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
    // Standalone verification mode (not a git repository)
    // Accept valid SHA shape without exact repository equality
  }

  if (headSha && metadata.sha !== headSha) {
    throw new Error(
      `release.json SHA (${metadata.sha}) does not match current Git HEAD (${headSha})`,
    )
  }

  const refs = [...indexHtml.matchAll(/(?:src|href)="\/([^"]+)"/g)].map(
    (m) => m[1],
  )
  for (const ref of refs) {
    if (ref.startsWith('assets/')) {
      const target = path.join(dist, ref)
      if (!fs.existsSync(target)) {
        throw new Error(`Referenced asset missing: ${ref}`)
      }
    }
  }

  for (const file of assets) {
    const content = fs.readFileSync(path.join(dist, 'assets', file), 'utf8')
    if (content.includes('gateway.example.com')) {
      throw new Error(`Baked-in backend hostname found in ${file}`)
    }
  }

  console.log('Artifact verification passed.')
}

try {
  verify()
} catch (e) {
  console.error(e.message)
  process.exit(1)
}
