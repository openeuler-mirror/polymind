const fs = require('node:fs')

function main() {
  const commitMessageFile = process.argv[2]

  if (!commitMessageFile || !fs.existsSync(commitMessageFile)) {
    console.error('commit-msg: commit message file not found')
    process.exit(1)
  }

  const message = fs.readFileSync(commitMessageFile, 'utf8').trim()
  const firstLine = message.split(/\r?\n/, 1)[0].trim()

  if (!firstLine) {
    console.error('commit-msg: commit message cannot be empty')
    process.exit(1)
  }
}

main()
