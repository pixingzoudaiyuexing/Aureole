import fs from 'node:fs'
import { execSync } from 'node:child_process'

const sha = execSync('git rev-parse HEAD').toString().trim()
const metadata = {
  sha,
  buildTime: new Date().toISOString(),
}

fs.writeFileSync('dist/release.json', JSON.stringify(metadata, null, 2))
console.log('Generated dist/release.json')
