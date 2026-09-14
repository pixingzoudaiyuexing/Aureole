import { execSync } from 'node:child_process'

try {
  const status = execSync('git status --porcelain').toString()
  if (status.trim() !== '') {
    console.error('Worktree is not clean. Rejecting release build.')
    console.error(status)
    process.exit(1)
  }
} catch {
  console.error('Failed to run git status')
  process.exit(1)
}
