'use client'

import { useMemo, useRef, useState } from 'react'
import { FileUp, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

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
import {
  createEditableCommitImportPreviewEntry,
  getEditableCommitImportPreviewEntryKey,
  type EditableCommitImportPreviewEntry,
} from '@/components/tool-panel/backport/commit-import-preview-entry'
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

function validateEntries(
  entries: BackportCommitImportPreviewRow[],
  t: TFunction
): BackportCommitImportIssue[] {
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
        message: t('backport.import.issue.shaInvalid'),
      })
    }
    if (!title) {
      issues.push({ row, field: 'commit_title', message: t('backport.import.issue.titleEmpty') })
    } else if (/\r|\n/.test(title)) {
      issues.push({ row, field: 'commit_title', message: t('backport.import.issue.titleSingleLine') })
    }
    const previous = titlesByCommit.get(commit.toLowerCase())
    if (previous !== undefined && previous !== title) {
      issues.push({
        row,
        field: 'commit_id',
        message: t('backport.import.issue.titleMismatch'),
      })
    }
    if (commit) titlesByCommit.set(commit.toLowerCase(), title)
  })
  if (entries.length === 0) issues.push({ message: t('backport.import.issue.atLeastOne') })
  if (entries.length > 5000) issues.push({ message: t('backport.import.issue.tooMany') })
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
  const { t } = useTranslation('tool-panel')
  const [text, setText] = useState('')
  const [delimiter, setDelimiter] = useState<'csv' | 'tsv'>('csv')
  const [entries, setEntries] = useState<EditableCommitImportPreviewEntry[]>([])
  const [sourceIssues, setSourceIssues] = useState<BackportCommitImportIssue[]>([])
  const [warnings, setWarnings] = useState<BackportCommitImportIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [requestError, setRequestError] = useState('')
  const nextClientId = useRef(1)

  const createEntry = (entry: BackportCommitImportPreviewRow) =>
    createEditableCommitImportPreviewEntry(nextClientId.current++, entry)

  const localIssues = useMemo(() => validateEntries(entries, t), [entries, t])
  const allIssues = [...sourceIssues, ...localIssues]

  const applyPreview = (preview: BackportCommitImportPreview) => {
    setEntries(
      (preview.rows || preview.entries || []).map((entry, index) => ({
        ...createEntry({
          commit: entry.commit || '',
          commit_title: entry.commit_title || '',
          row: typeof entry.row === 'number' ? entry.row : index + 1,
        }),
      }))
    )
    setSourceIssues(preview.errors || [])
    setWarnings(preview.warnings || [])
    setRequestError('')
  }

  const previewText = async () => {
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
      setRequestError(t('backport.import.error.textTooLarge'))
      return
    }
    setLoading(true)
    try {
      applyPreview(await backportService.previewCommitImportText(text, delimiter))
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : t('backport.import.error.parseText'))
    } finally {
      setLoading(false)
    }
  }

  const previewFile = async (file: File | undefined) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setRequestError(t('backport.import.error.csvOnly'))
      return
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setRequestError(t('backport.import.error.fileTooLarge'))
      return
    }
    setLoading(true)
    try {
      applyPreview(await backportService.previewCommitImportFile(file))
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : t('backport.import.error.uploadCsv'))
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
          <DialogTitle>{t('backport.import.title')}</DialogTitle>
          <DialogDescription>{t('backport.import.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">{t('backport.import.uploadCsv')}</p>
            <Input
              type="file"
              accept=".csv,text/csv"
              disabled={loading}
              onChange={event => void previewFile(event.target.files?.[0])}
            />
            <p className="text-xs text-muted-foreground">{t('backport.import.localFileHint')}</p>
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{t('backport.import.pasteText')}</p>
              <select
                className="h-8 rounded-md border bg-background px-2 text-xs"
                value={delimiter}
                onChange={event => setDelimiter(event.target.value as 'csv' | 'tsv')}
              >
                <option value="csv">{t('backport.import.delimiterCsv')}</option>
                <option value="tsv">{t('backport.import.delimiterTsv')}</option>
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
              {t('backport.import.parsePreview')}
            </Button>
          </div>
        </div>

        {requestError ? <p className="text-sm text-destructive">{requestError}</p> : null}
        {allIssues.length ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <p className="font-medium">{t('backport.import.fixIssues')}</p>
            <ul className="mt-1 list-disc pl-5">
              {allIssues.map((issue, index) => (
                <li key={`${issue.row || 'global'}-${index}`}>
                  {issue.row ? t('backport.import.rowPrefix', { row: issue.row }) : ''}
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
                    {issue.row
                      ? t('backport.import.deleteRow', { row: issue.row })
                      : t('backport.import.deleteError')}
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
                {warning.row ? t('backport.import.rowPrefix', { row: warning.row }) : ''}
                {warning.message}
              </p>
            ))}
          </div>
        ) : null}

        {entries.length ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {t('backport.import.editablePreview', { count: entries.length })}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setEntries(current => [...current, createEntry({ commit: '', commit_title: '' })])
                }
              >
                <Plus className="mr-1 h-4 w-4" />
                {t('backport.import.add')}
              </Button>
            </div>
            <div className="space-y-2">
              {entries.map((entry, index) => (
                <div
                  key={getEditableCommitImportPreviewEntryKey(entry)}
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
                    title={t('backport.import.deleteThisRow')}
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
            {t('common:action.cancel')}
          </Button>
          <Button
            type="button"
            onClick={confirm}
            disabled={loading || allIssues.length > 0 || entries.length === 0}
          >
            {t('backport.import.confirmReplace')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
