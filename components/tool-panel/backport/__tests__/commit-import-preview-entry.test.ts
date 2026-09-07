import {
  createEditableCommitImportPreviewEntry,
  getEditableCommitImportPreviewEntryKey,
} from '@/components/tool-panel/backport/commit-import-preview-entry'

describe('commit import preview entry', () => {
  it('keeps the React key stable while commit_id is edited', () => {
    const entry = createEditableCommitImportPreviewEntry(1, {
      commit: 'abcdef1',
      commit_title: 'Fix import',
      row: 2,
    })
    const editedEntry = { ...entry, commit: 'abcdef12' }

    expect(getEditableCommitImportPreviewEntryKey(editedEntry)).toBe(
      getEditableCommitImportPreviewEntryKey(entry)
    )
  })
})
