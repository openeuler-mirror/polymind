'use client'

import {
  Activity,
  ExternalLink,
  HeartPulse,
  MessageSquareText,
  Radar,
  TriangleAlert,
} from 'lucide-react'
import { WITTY_INSIGHT_PROJECT_URL } from '@/services/insight/availability'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function InsightSetupPanel() {
  const capabilities = [
    {
      icon: MessageSquareText,
      label: '会话轨迹',
      description: '查看 Session 与 Conversation 的运行轨迹',
    },
    {
      icon: Activity,
      label: 'Token 统计',
      description: '查看 Token 趋势和模型负载变化',
    },
    {
      icon: TriangleAlert,
      label: '异常中断',
      description: '定位运行期间的异常与中断事件',
    },
    {
      icon: HeartPulse,
      label: '健康状态',
      description: '检查 Agent Runtime、Adapter 与桥接状态',
    },
  ]

  const nextSteps = [
    '确认 witty-service 已启用 Insight 集成',
    '确认 witty-service 可以访问 witty-insight 服务',
    '刷新此页面，系统会通过 witty-service 自动检测并加载监测数据',
  ]

  return (
    <div className="flex min-h-[460px] items-center justify-center">
      <Card className="w-full max-w-5xl">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
          <section className="space-y-4 rounded-xl border bg-card p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Radar className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-semibold text-foreground">监测系统</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    运行观测能力由 witty-service 聚合提供
                  </p>
                </div>
              </div>

              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                <TriangleAlert className="h-3.5 w-3.5" />
                后端未连接
              </Badge>
            </div>

            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>暂时无法展示监测数据</AlertTitle>
              <AlertDescription>
                当前前端尚未从 witty-service 获取到可用的 Insight 能力。请确认 witty-service 已启用
                Insight 集成，并且它能够访问
                witty-insight；恢复连通后，返回此页面即可自动加载总览、轨迹、异常中断和健康状态数据。
              </AlertDescription>
            </Alert>

            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>
                这组观测能力通过 witty-service 对外聚合，用于观测 AI Agent
                的运行过程，帮助定位会话轨迹、模型负载和运行异常。
              </p>
              <p>
                前端不会直连 raw witty-insight；如果这里不可用，请优先检查 witty-service 与
                witty-insight 的集成链路。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href={WITTY_INSIGHT_PROJECT_URL} target="_blank" rel="noreferrer">
                  查看 Witty Insight 项目
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">可提供能力</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {capabilities.map(item => (
                  <div key={item.label} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="mt-0.5 rounded-md bg-muted p-2 text-foreground">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <div className="text-xs leading-5 text-muted-foreground">
                        {item.description}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">接入步骤</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {nextSteps.map((step, index) => (
                  <div key={step} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {index + 1}
                    </div>
                    <div className="text-sm leading-6 text-foreground">{step}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        </CardContent>
      </Card>
    </div>
  )
}
