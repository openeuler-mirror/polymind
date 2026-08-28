'use client'

import { useMemo, useState } from 'react'
import { FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type {
  BackportCommitImportEntry,
  BackportCommitImportIssue,
  BackportCommitImportPreview,
  BackportCommitImportPreviewRow,
} from '@/lib/backport-types'
import { backportService } from '@/services/backport-service'

const MAX_IMPORT_BYTES = 1024 * 1024
const SHA_PATTERN = /^[0-9a-fA-F]{7,}$/

interface CommitImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (entries: BackportCommitImportEntry[]) => void
}

function validateEntries(entries: BackportCommitImportPreviewRow[]): BackportCommitImportIssue[] {
  const issues: BackportCommitImportIssue[] = []
  const titlesByCommit = new Map<string, string>()
  entries.forEach((entry, index) => {
    const row = entry.row || index + 1
    const commit = entry.commit.trim()
    const title = entry.commit_title.trim()
    if (!SHA_PATTERN.test(commit)) {
      issues.push({
        row,
        field: 'commit_id',
        message: 'commit_id 必须是至少 7 位的十六进制 Git SHA',
      })
    }
    if (!title) {
      issues.push({ row, field: 'commit_title', message: 'commit_title 不能为空' })
    } else if (/\r|\n/.test(title)) {
      issues.push({ row, field: 'commit_title', message: 'commit_title 必须为单行文本' })
    }
    const previous = titlesByCommit.get(commit.toLowerCase())
    if (previous !== undefined && previous !== title) {
      issues.push({ row, field: 'commit_id', message: '同一 commit_id 的 commit_title 必须一致' })
    }
    if (commit) titlesByCommit.set(commit.toLowerCase(), title)
  })
  if (entries.length === 0) issues.push({ message: '至少保留一条提交' })
  if (entries.length > 5000) issues.push({ message: '提交数不能超过 5,000 条' })
  return issues
}

function normalizedEntries(entries: BackportCommitImportEntry[]): BackportCommitImportEntry[] {
  const result: BackportCommitImportEntry[] = []
  const seen = new Set<string>()
  for (const entry of entries) {
    const normalized = { commit: entry.commit.trim(), commit_title: entry.commit_title.trim() }
    const key = `${normalized.commit.toLowerCase()}\u0000${normalized.commit_title}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

export function CommitImportDialog({ open, onOpenChange, onConfirm }: CommitImportDialogProps) {
  const [text, setText] = useState('')
  const [delimiter, setDelimiter] = useState<'csv' | 'tsv'>('csv')
  const [entries, setEntries] = useState<BackportCommitImportPreviewRow[]>([])
  const [sourceIssues, setSourceIssues] = useState<BackportCommitImportIssue[]>([])
  const [warnings, setWarnings] = useState<BackportCommitImportIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState('')

  const localIssues = useMemo(() => validateEntries(entries), [entries])
  const allIssues = [...sourceIssues, ...localIssues]

  const applyPreview = (preview: BackportCommitImportPreview) => {
    setEntries(
      (preview.rows || preview.entries || []).map((entry, index) => ({
        commit: entry.commit || '',
        commit_title: entry.commit_title || '',
        row: typeof entry.row === 'number' ? entry.row : index + 1,
      }))
    )
    setSourceIssues(preview.errors || [])
    setWarnings(preview.warnings || [])
    setRequestError('')
  }

  const previewText = async () => {
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
      setRequestError('粘贴内容不能超过 1 MiB。')
      return
    }
    setLoading(true)
    try {
      applyPreview(await backportService.previewCommitImportText(text, delimiter))
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : '解析提交文本失败')
    } finally {
      setLoading(false)
    }
  }

  const previewFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setRequestError('仅支持 .csv 文件；TSV 请使用粘贴导入。')
      return
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setRequestError('文件不能超过 1 MiB。')
      return
    }
    setLoading(true)
    try {
      applyPreview(await backportService.previewCommitImportFile(file))
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : '上传 CSV 失败')
    } finally {
      setLoading(false)
    }
  }

  const updateEntry = (index: number, field: keyof BackportCommitImportEntry, value: string) => {
    const sourceRow = entries[index]?.row
    setEntries(current =>
      current.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    )
    if (sourceRow) {
      setSourceIssues(current =>
        current.filter(issue => issue.row !== sourceRow || issue.field === 'row')
      )
    }
  }

  const confirm = () => {
    if (allIssues.length) return
    onConfirm(normalizedEntries(entries))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>导入 Backport 提交</DialogTitle>
          <DialogDescription>
            可上传浏览器所在机器的 CSV，或粘贴 CSV/TSV。只接受 commit_id、commit_title
            两列；确认后会替换当前提交清单。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">上传 CSV</p>
            <Input
              type="file"
              accept=".csv,text/csv"
              disabled={loading}
              onChange={event => void previewFile(event.target.files?.[0])}
            />
            <p className="text-xs text-muted-foreground">浏览器本机文件，最大 1 MiB。</p>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">粘贴表格文本</p>
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={delimiter}
                onChange={event => setDelimiter(event.target.value as 'csv' | 'tsv')}
              >
                <option value="csv">CSV（逗号）</option>
                <option value="tsv">TSV（Tab）</option>
              </select>
            </div>
            <Textarea
              value={text}
              onChange={event => setText(event.target.value)}
              className="min-h-24 font-mono text-xs"
              placeholder="commit_id,commit_title"
              disabled={loading}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void previewText()}
              disabled={loading || !text.trim()}
            >
              {loading ? (
                <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileUp className="mr-1 h-4 w-4" />
              )}
              解析预览
            </Button>
          </div>
        </div>

        {requestError ? <p className="text-sm text-destructive">{requestError}</p> : null}
        {allIssues.length ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">请修正或删除全部无效行后再确认：</p>
            <ul className="mt-1 list-disc pl-5">
              {allIssues.map((issue, index) => (
                <li key={`${issue.row || 'global'}-${index}`}>
                  {issue.row ? `第 ${issue.row} 行：` : ''}
                  {issue.message}
                </li>
              ))}
            </ul>
            {sourceIssues.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {sourceIssues.map((issue, index) => (
                  <Button
                    key={`${issue.row || 'global'}-${index}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (issue.row) {
                        setEntries(current => current.filter(entry => entry.row !== issue.row))
                        setSourceIssues(current => current.filter(item => item.row !== issue.row))
                        return
                      }
                      setSourceIssues(current =>
                        current.filter((_, issueIndex) => issueIndex !== index)
                      )
                    }}
                  >
                    删除{issue.row ? `第 ${issue.row} 行` : '此错误'}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {warnings.length ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {warnings.map((warning, index) => (
              <p key={`${warning.row || 'global'}-${index}`}>
                {warning.row ? `第 ${warning.row} 行：` : ''}
                {warning.message}
              </p>
            ))}
          </div>
        ) : null}

        {entries.length ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">可编辑预览（{entries.length} 条）</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setEntries(current => [...current, { commit: '', commit_title: '' }])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                新增
              </Button>
            </div>
            <div className="space-y-2">
              {entries.map((entry, index) => (
                <div
                  key={`${index}-${entry.commit}`}
                  className="grid grid-cols-[minmax(120px,0.4fr)_minmax(180px,1fr)_auto] gap-2"
                >
                  <Input
                    value={entry.commit}
                    onChange={event => updateEntry(index, 'commit', event.target.value)}
                    placeholder="commit_id"
                    className="font-mono text-xs"
                  />
                  <Input
                    value={entry.commit_title}
                    onChange={event => updateEntry(index, 'commit_title', event.target.value)}
                    placeholder="commit_title"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      const sourceRow = entry.row
                      setEntries(current => current.filter((_, entryIndex) => entryIndex !== index))
                      if (sourceRow) {
                        setSourceIssues(current => current.filter(issue => issue.row !== sourceRow))
                      }
                    }}
                    title="删除此行"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={loading || allIssues.length > 0 || entries.length === 0}
          >
            确认并替换提交清单
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
