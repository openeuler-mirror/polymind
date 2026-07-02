'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { AlertCircle, ChartColumnBig, LineChart as LineChartIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import type { InsightOverviewTimeseriesController } from '@/hooks/insight/use-overview'
import type { ModelTimeseriesBucket, TimeseriesBucket } from '@/hooks/insight/types'
import { cn } from '@/lib/utils'
import {
  buildModelChartData,
  buildTokenChartData,
  MODEL_COLORS,
  TOKEN_SERIES,
} from './timeseries-utils'

interface LegendPayloadItem {
  color?: string
  dataKey?: string | number
  value?: string | number
}

function TimeseriesSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[240px] w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function InteractiveLegend({
  hidden,
  labels,
  onToggle,
  payload,
}: {
  hidden: Set<string>
  labels: Record<string, string>
  onToggle: (key: string) => void
  payload?: LegendPayloadItem[]
}) {
  if (!payload?.length) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-4 pt-3 text-xs">
      {payload.map(item => {
        const key = String(item.dataKey ?? item.value ?? '')
        const active = !hidden.has(key)

        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className="inline-flex items-center gap-1.5 text-foreground/90 transition-colors hover:text-foreground"
          >
            <span
              className={cn('h-2 w-2 rounded-[2px]', !active && 'opacity-40')}
              style={{ backgroundColor: item.color }}
            />
            <span className={cn(!active && 'text-muted-foreground line-through')}>
              {labels[key] ?? key}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const TOKEN_CHART_CONFIG = TOKEN_SERIES.reduce<ChartConfig>((config, series) => {
  config[series.key] = {
    label: series.label,
    color: series.color,
  }
  return config
}, {})

function TokenTimeseriesChart({
  data,
  startNs,
  endNs,
  bucketCount = 30,
}: {
  data: TimeseriesBucket[]
  startNs: number
  endNs: number
  bucketCount?: number
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const { chartData, filled, ticks } = buildTokenChartData({
    data,
    startNs,
    endNs,
    bucketCount,
  })

  if (filled.every(bucket => bucket.total_tokens === 0)) {
    return (
      <Empty className="border-muted bg-background/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LineChartIcon />
          </EmptyMedia>
          <EmptyTitle className="text-base">暂无 Token 时序数据</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ChartContainer config={TOKEN_CHART_CONFIG} className="h-[240px] w-full aspect-auto">
      <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend
          content={props => (
            <InteractiveLegend
              hidden={hidden}
              labels={Object.fromEntries(TOKEN_SERIES.map(series => [series.key, series.label]))}
              onToggle={key => {
                setHidden(currentValue => {
                  const nextValue = new Set(currentValue)
                  if (nextValue.has(key)) {
                    nextValue.delete(key)
                  } else {
                    nextValue.add(key)
                  }
                  return nextValue
                })
              }}
              payload={props.payload as LegendPayloadItem[]}
            />
          )}
        />
        {TOKEN_SERIES.map(series => (
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stroke={`var(--color-${series.key})`}
            dot={false}
            strokeWidth={2}
            hide={hidden.has(series.key)}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}

function ModelTimeseriesChart({
  data,
  startNs,
  endNs,
  bucketCount = 30,
}: {
  data: ModelTimeseriesBucket[]
  startNs: number
  endNs: number
  bucketCount?: number
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const { chartData, models, ticks } = buildModelChartData({
    data,
    startNs,
    endNs,
    bucketCount,
  })

  const chartConfig = useMemo(() => {
    return models.reduce<ChartConfig>((config, model, index) => {
      config[model] = {
        label: model,
        color: MODEL_COLORS[index % MODEL_COLORS.length],
      }
      return config
    }, {})
  }, [models])

  if (models.length === 0) {
    return (
      <Empty className="border-muted bg-background/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ChartColumnBig />
          </EmptyMedia>
          <EmptyTitle className="text-base">暂无模型 Token 时序数据</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ChartContainer config={chartConfig} className="h-[240px] w-full aspect-auto">
      <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" ticks={ticks} tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} width={56} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend
          content={props => (
            <InteractiveLegend
              hidden={hidden}
              labels={Object.fromEntries(models.map(model => [model, model]))}
              onToggle={key => {
                setHidden(currentValue => {
                  const nextValue = new Set(currentValue)
                  if (nextValue.has(key)) {
                    nextValue.delete(key)
                  } else {
                    nextValue.add(key)
                  }
                  return nextValue
                })
              }}
              payload={props.payload as LegendPayloadItem[]}
            />
          )}
        />
        {models.map(model => (
          <Bar
            key={model}
            dataKey={model}
            name={model}
            stackId="model"
            fill={`var(--color-${model})`}
            hide={hidden.has(model)}
            radius={2}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

interface InsightTimeseriesPanelsProps {
  controller: InsightOverviewTimeseriesController
}

export function InsightTimeseriesPanels({ controller }: InsightTimeseriesPanelsProps) {
  if (controller.loading) {
    return <TimeseriesSkeleton />
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Token 时序图</CardTitle>
        </CardHeader>
        <CardContent>
          {controller.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>时序图加载失败</AlertTitle>
              <AlertDescription>{controller.error}</AlertDescription>
            </Alert>
          ) : (
            <TokenTimeseriesChart
              data={controller.tokenSeries}
              startNs={controller.startNs}
              endNs={controller.endNs}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">模型 Token 时序图</CardTitle>
        </CardHeader>
        <CardContent>
          {controller.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>时序图加载失败</AlertTitle>
              <AlertDescription>{controller.error}</AlertDescription>
            </Alert>
          ) : (
            <ModelTimeseriesChart
              data={controller.modelSeries}
              startNs={controller.startNs}
              endNs={controller.endNs}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
