import { BackportPatchKind } from '@/lib/backport-types'

export interface ParsedPatchHunk {
  id: string
  fileId: string
  filePath: string
  header: string
  lineIndex: number
}

export interface ParsedPatchFile {
  id: string
  kind: BackportPatchKind
  path: string
  oldPath: string
  newPath: string
  additions: number
  deletions: number
  hunkIds: string[]
}

export interface ParsedPatchSummary {
  kind: BackportPatchKind
  files: ParsedPatchFile[]
  hunks: ParsedPatchHunk[]
  additions: number
  deletions: number
  lineCount: number
  rawLines: string[]
}

function normalizePatchPath(value: string): string {
  return value.replace(/^(a|b)\//, '').trim()
}

function extractPatchPath(line: string, prefix: string): string {
  if (!line.startsWith(prefix)) return ''
  const raw = line.slice(prefix.length).trim()
  if (raw === '/dev/null') return raw
  return normalizePatchPath(raw)
}

export function parseUnifiedDiff(kind: BackportPatchKind, patchText: string): ParsedPatchSummary {
  const rawLines = patchText.split(/\r?\n/)
  const files: ParsedPatchFile[] = []
  const hunks: ParsedPatchHunk[] = []
  let totalAdditions = 0
  let totalDeletions = 0
  let currentFile: ParsedPatchFile | null = null

  const ensureCurrentFile = (fallbackPath = 'unknown-file'): ParsedPatchFile => {
    if (currentFile) return currentFile
    currentFile = {
      id: `patch-file-${files.length}`,
      kind,
      path: fallbackPath,
      oldPath: '',
      newPath: '',
      additions: 0,
      deletions: 0,
      hunkIds: [],
    }
    files.push(currentFile)
    return currentFile
  }

  for (const [lineIndex, line] of rawLines.entries()) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
      const filePath = normalizePatchPath(match?.[2] || match?.[1] || `unknown-file-${files.length + 1}`)
      currentFile = {
        id: `patch-file-${files.length}`,
        kind,
        path: filePath,
        oldPath: match?.[1] ? normalizePatchPath(match[1]) : '',
        newPath: match?.[2] ? normalizePatchPath(match[2]) : '',
        additions: 0,
        deletions: 0,
        hunkIds: [],
      }
      files.push(currentFile)
      continue
    }

    if (line.startsWith('--- ')) {
      const file = ensureCurrentFile()
      file.oldPath = extractPatchPath(line, '--- ')
      if (!file.path || file.path.startsWith('unknown-file')) {
        file.path = file.oldPath === '/dev/null' ? file.path : file.oldPath
      }
      continue
    }

    if (line.startsWith('+++ ')) {
      const file = ensureCurrentFile()
      file.newPath = extractPatchPath(line, '+++ ')
      if (!file.path || file.path.startsWith('unknown-file')) {
        file.path = file.newPath === '/dev/null' ? file.path : file.newPath
      }
      continue
    }

    if (line.startsWith('@@')) {
      const file = ensureCurrentFile()
      const hunkId = `${file.id}-hunk-${file.hunkIds.length + 1}`
      file.hunkIds.push(hunkId)
      hunks.push({
        id: hunkId,
        fileId: file.id,
        filePath: file.path,
        header: line.trim(),
        lineIndex,
      })
      continue
    }

    if (line.startsWith('+') && !line.startsWith('+++')) {
      const file = ensureCurrentFile()
      file.additions += 1
      totalAdditions += 1
      continue
    }

    if (line.startsWith('-') && !line.startsWith('---')) {
      const file = ensureCurrentFile()
      file.deletions += 1
      totalDeletions += 1
    }
  }

  return {
    kind,
    files,
    hunks,
    additions: totalAdditions,
    deletions: totalDeletions,
    lineCount: rawLines.length,
    rawLines,
  }
}

export type PatchLineType = 'meta' | 'file' | 'hunk' | 'add' | 'remove' | 'context'

export function classifyPatchLine(line: string): PatchLineType {
  if (!line) return 'context'
  if (
    line.startsWith('diff --git ') ||
    line.startsWith('index ') ||
    line.startsWith('new file mode ') ||
    line.startsWith('deleted file mode ') ||
    line.startsWith('similarity index ') ||
    line.startsWith('rename from ') ||
    line.startsWith('rename to ')
  ) {
    return 'meta'
  }
  if (line.startsWith('--- ') || line.startsWith('+++ ')) return 'file'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+') && !line.startsWith('+++')) return 'add'
  if (line.startsWith('-') && !line.startsWith('---')) return 'remove'
  return 'context'
}

export function getLightPatchLineClass(lineType: PatchLineType): string {
  if (lineType === 'meta') return 'bg-slate-100 text-slate-700'
  if (lineType === 'file') return 'bg-blue-50 text-blue-800'
  if (lineType === 'hunk') return 'bg-slate-50 text-slate-500'
  if (lineType === 'add') return 'bg-emerald-50 text-emerald-900'
  if (lineType === 'remove') return 'bg-red-50 text-red-900'
  return 'bg-white text-slate-800'
}
