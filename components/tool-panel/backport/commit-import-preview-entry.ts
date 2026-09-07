import type { BackportCommitImportPreviewRow } from '@/lib/backport-types'

export type EditableCommitImportPreviewEntry = BackportCommitImportPreviewRow & {
  clientId: number
}

export function createEditableCommitImportPreviewEntry(
  clientId: number,
  entry: BackportCommitImportPreviewRow
): EditableCommitImportPreviewEntry {
  return { ...entry, clientId }
}

export function getEditableCommitImportPreviewEntryKey(
  entry: EditableCommitImportPreviewEntry
): number {
  return entry.clientId
}
