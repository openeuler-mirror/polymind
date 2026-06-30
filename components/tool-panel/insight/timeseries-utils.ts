import type { ModelTimeseriesBucket, TimeseriesBucket } from '@/hooks/insight/types'

export const MODEL_COLORS = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#7c3aed',
  '#ec4899',
  '#0891b2',
  '#f97316',
] as const

export const TOKEN_SERIES = [
  { key: 'input', label: '输入 Token', color: '#2563eb' },
  { key: 'output', label: '输出 Token', color: '#059669' },
  { key: 'total', label: '总 Token', color: '#7c3aed' },
] as const

export function formatTimeseriesValue(value: number): string {
  return value.toLocaleString('zh-CN')
}

export function nsToLabel(ns: number, spanMs: number): string {
  const date = new Date(ns / 1_000_000)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const hm = `${hours}:${minutes}`

  if (spanMs > 23 * 3600 * 1000) {
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${month}-${day} ${hm}`
  }

  return hm
}

export function buildTimeseriesTicks<T extends { label: string }>(
  chartData: T[],
  bucketCount: number
): string[] {
  const tickStep = Math.max(1, Math.floor(bucketCount / 6))
  return chartData.filter((_, index) => index % tickStep === 0).map(item => item.label)
}

export function fillTokenBuckets(
  data: TimeseriesBucket[],
  startNs: number,
  endNs: number,
  bucketCount: number
): TimeseriesBucket[] {
  const bucketNs = Math.floor((endNs - startNs) / Math.max(bucketCount, 1))

  if (bucketNs <= 0) {
    return data
  }

  const byIndex = new Map<number, TimeseriesBucket>()

  data.forEach(bucket => {
    const index = Math.floor((bucket.bucket_start_ns - startNs) / bucketNs)
    byIndex.set(index, bucket)
  })

  return Array.from({ length: bucketCount }, (_, index) => {
    return (
      byIndex.get(index) ?? {
        bucket_start_ns: startNs + index * bucketNs,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      }
    )
  })
}

export function fillModelBuckets(
  data: ModelTimeseriesBucket[],
  startNs: number,
  endNs: number,
  bucketCount: number,
  models: string[]
): ModelTimeseriesBucket[] {
  const bucketNs = Math.floor((endNs - startNs) / Math.max(bucketCount, 1))

  if (bucketNs <= 0) {
    return data
  }

  const byIndexModel = new Map<number, Map<string, number>>()

  data.forEach(bucket => {
    const index = Math.floor((bucket.bucket_start_ns - startNs) / bucketNs)

    if (!byIndexModel.has(index)) {
      byIndexModel.set(index, new Map())
    }

    byIndexModel.get(index)?.set(bucket.model, bucket.total_tokens)
  })

  return Array.from({ length: bucketCount }).flatMap((_, index) => {
    const bucketStartNs = startNs + index * bucketNs
    const bucketModelMap = byIndexModel.get(index)

    return models.map(model => ({
      bucket_start_ns: bucketStartNs,
      model,
      total_tokens: bucketModelMap?.get(model) ?? 0,
    }))
  })
}

export function buildTokenChartData({
  data,
  startNs,
  endNs,
  bucketCount,
}: {
  data: TimeseriesBucket[]
  startNs: number
  endNs: number
  bucketCount: number
}) {
  const spanMs = (endNs - startNs) / 1_000_000
  const filled = fillTokenBuckets(data, startNs, endNs, bucketCount)
  const chartData = filled.map(bucket => ({
    label: nsToLabel(bucket.bucket_start_ns, spanMs),
    input: bucket.input_tokens,
    output: bucket.output_tokens,
    total: bucket.total_tokens,
  }))

  return {
    chartData,
    filled,
    ticks: buildTimeseriesTicks(chartData, bucketCount),
  }
}

export function buildModelChartData({
  data,
  startNs,
  endNs,
  bucketCount,
}: {
  data: ModelTimeseriesBucket[]
  startNs: number
  endNs: number
  bucketCount: number
}) {
  const spanMs = (endNs - startNs) / 1_000_000
  const models = Array.from(new Set(data.map(item => item.model))).sort()
  const filled = fillModelBuckets(data, startNs, endNs, bucketCount, models)
  const bucketMap = new Map<number, Record<string, number>>()

  filled.forEach(bucket => {
    if (!bucketMap.has(bucket.bucket_start_ns)) {
      bucketMap.set(bucket.bucket_start_ns, {})
    }

    bucketMap.get(bucket.bucket_start_ns)![bucket.model] = bucket.total_tokens
  })

  const chartData = Array.from(bucketMap.entries())
    .sort(([left], [right]) => left - right)
    .map(([bucketStartNs, tokens]) => ({
      label: nsToLabel(bucketStartNs, spanMs),
      ...tokens,
    }))

  return {
    chartData,
    filled,
    models,
    ticks: buildTimeseriesTicks(chartData, bucketCount),
  }
}
