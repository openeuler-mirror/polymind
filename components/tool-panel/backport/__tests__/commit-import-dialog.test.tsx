/** @jest-environment jsdom */

import { TextEncoder } from 'node:util'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'

import { CommitImportDialog } from '@/components/tool-panel/backport/commit-import-dialog'
import i18n from '@/lib/i18n/config'

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
    // 对话框文案走 i18n（tool-panel 命名空间）：用真实语言资源渲染，
    // 否则 t() 只回显 key，按「解析预览」取按钮会落空
    render(
      <I18nextProvider i18n={i18n}>
        <CommitImportDialog open onOpenChange={jest.fn()} onConfirm={jest.fn()} />
      </I18nextProvider>
    )

    await user.type(screen.getByPlaceholderText('commit_id,commit_title'), 'commit_id,commit_title')
    await user.click(screen.getByRole('button', { name: '解析预览' }))

    const commitInput = await screen.findByDisplayValue('abcdef1')
    await user.clear(commitInput)
    await user.type(commitInput, 'abcdef123')

    expect(commitInput).toBe(document.activeElement)
    expect((commitInput as HTMLInputElement).value).toBe('abcdef123')
  })
})
