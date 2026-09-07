import { format } from 'date-fns'

/**
 * 解析可能缺失/为空串/非法的 ISO 时间，统一返回 Date 或 null。
 * 后端可空时间字段可能序列化为空串，直接 new Date('') 会得到 Invalid Date，
 * 传给 date-fns（如 format）会抛 RangeError。
 */
export function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 取执行记录的开始时间（无则用创建时间兜底），缺失时返回 fallback。 */
export function getRunDate(
  run: { started_at?: string | null; created_at?: string | null },
  fallback: Date = new Date(0)
): Date {
  return parseDateSafe(run.started_at) ?? parseDateSafe(run.created_at) ?? fallback
}

/** 将 ISO 时间格式化为 "yyyy-MM-dd HH:mm"，缺失/非法时返回占位符。 */
export function formatDateTime(iso: string | null | undefined): string {
  const date = parseDateSafe(iso)
  if (!date) return '--'
  return format(date, 'yyyy-MM-dd HH:mm')
}
