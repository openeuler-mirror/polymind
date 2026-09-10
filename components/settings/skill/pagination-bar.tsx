'use client'

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export const PAGE_SIZE_OPTIONS = [12, 24, 48] as const

export function SkillPaginationBar({
  total,
  currentPage,
  totalPages,
  pageSize,
  onPageSizeChange,
  onPrev,
  onNext,
}: {
  total: number
  currentPage: number
  totalPages: number
  pageSize: number
  onPageSizeChange: (value: number) => void
  onPrev: () => void
  onNext: () => void
}) {
  const { t } = useTranslation('settings')

  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-md border border-border/60 bg-background/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        {t('skill.pagination.summary', { total, current: currentPage, pages: totalPages })}
      </p>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={value => onPageSizeChange(Number(value))}>
          <SelectTrigger className="h-8 w-28">
            <SelectValue placeholder={t('skill.pagination.pageSizePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(size => (
              <SelectItem key={size} value={String(size)}>
                {t('skill.pagination.pageSizeOption', { size })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={onPrev} disabled={currentPage <= 1}>
          {t('skill.pagination.prev')}
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={currentPage >= totalPages}>
          {t('skill.pagination.next')}
        </Button>
      </div>
    </div>
  )
}
