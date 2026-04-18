const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const rootDir = process.cwd()
const textFilePattern = /\.(cjs|css|js|json|jsx|md|mjs|ts|tsx)$/i
const conflictMarkerPattern = /^(<<<<<<< |=======|>>>>>>> )/m

function getStagedFiles() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { cwd: rootDir, encoding: 'utf8' },
  )

  return output
    .split(/\r?\n/)
    .map((filePath) => filePath.trim())
    .filter(Boolean)
}

function main() {
  const stagedFiles = getStagedFiles().filter((filePath) => textFilePattern.test(filePath))

  if (stagedFiles.length === 0) {
    console.log('lint-staged: no matching staged files')
    return
  }

  const filesWithConflicts = []

  for (const relativePath of stagedFiles) {
    const absolutePath = path.join(rootDir, relativePath)
    if (!fs.existsSync(absolutePath)) {
      continue
    }

    const content = fs.readFileSync(absolutePath, 'utf8')
    if (conflictMarkerPattern.test(content)) {
      filesWithConflicts.push(relativePath)
    }
  }

  if (filesWithConflicts.length > 0) {
    console.error('lint-staged: found unresolved merge markers in:')
    filesWithConflicts.forEach((filePath) => console.error(`- ${filePath}`))
    process.exit(1)
  }

  console.log(`lint-staged: checked ${stagedFiles.length} staged file(s)`)
}

main()
