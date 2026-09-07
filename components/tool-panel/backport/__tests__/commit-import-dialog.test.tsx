/** @jest-environment jsdom */

import { TextEncoder } from 'node:util'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CommitImportDialog } from '@/components/tool-panel/backport/commit-import-dialog'

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder })

jest.mock('@/services/backport-service', () => ({
  backportService: {
    previewCommitImportText: jest.fn().mockResolvedValue({
      rows: [{ commit: 'abcdef1', commit_title: 'Fix import', row: 2 }],
    }),
  },
}))

describe('CommitImportDialog', () => {
  it('keeps commit_id focused and preserves the complete value while typing', async () => {
    const user = userEvent.setup()
    render(<CommitImportDialog open onOpenChange={jest.fn()} onConfirm={jest.fn()} />)

    await user.type(screen.getByPlaceholderText('commit_id,commit_title'), 'commit_id,commit_title')
    await user.click(screen.getByRole('button', { name: '解析预览' }))

    const commitInput = await screen.findByDisplayValue('abcdef1')
    await user.clear(commitInput)
    await user.type(commitInput, 'abcdef123')

    expect(commitInput).toBe(document.activeElement)
    expect((commitInput as HTMLInputElement).value).toBe('abcdef123')
  })
})
