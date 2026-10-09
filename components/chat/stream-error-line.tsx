'use client'

import { useTranslation } from 'react-i18next'
import type { StreamErrorPayload } from '@/lib/types'
import { resolveStreamErrorCopyKey } from '@/lib/stream-error'

/**
 * 流式错误的极简状态行（与正文同号字）：
 * 红点 + 「本轮运行失败」+ 按 code 本地化的文案
 */
export function StreamErrorLine({ error }: { error: StreamErrorPayload | null }) {
  const { t } = useTranslation('chat')
  const copyKey = resolveStreamErrorCopyKey(error?.code)

  return (
    <div role="status" className="flex min-w-0 items-center gap-2 text-sm">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
      <span className="shrink-0 text-destructive font-bold">{t('message.error.title')}</span>
      <span className="min-w-0 text-muted-foreground">{t(`message.error.codes.${copyKey}`)}</span>
    </div>
  )
}
