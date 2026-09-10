'use client'

import {
  Activity,
  ExternalLink,
  HeartPulse,
  MessageSquareText,
  Radar,
  TriangleAlert,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WITTY_INSIGHT_PROJECT_URL } from '@/services/insight/availability'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function InsightSetupPanel() {
  const { t } = useTranslation('tool-panel')

  const capabilities = [
    {
      icon: MessageSquareText,
      labelKey: 'insight.setup.capabilities.trace.label',
      descriptionKey: 'insight.setup.capabilities.trace.description',
    },
    {
      icon: Activity,
      labelKey: 'insight.setup.capabilities.token.label',
      descriptionKey: 'insight.setup.capabilities.token.description',
    },
    {
      icon: TriangleAlert,
      labelKey: 'insight.setup.capabilities.interruption.label',
      descriptionKey: 'insight.setup.capabilities.interruption.description',
    },
    {
      icon: HeartPulse,
      labelKey: 'insight.setup.capabilities.health.label',
      descriptionKey: 'insight.setup.capabilities.health.description',
    },
  ]

  const nextSteps = [
    t('insight.setup.step1'),
    t('insight.setup.step2'),
    t('insight.setup.step3'),
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
                  <CardTitle className="text-2xl font-semibold text-foreground">
                    {t('insight.title')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{t('insight.setup.subtitle')}</p>
                </div>
              </div>

              <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                <TriangleAlert className="h-3.5 w-3.5" />
                {t('insight.setup.backendDisconnected')}
              </Badge>
            </div>

            <Alert>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>{t('insight.setup.unavailableTitle')}</AlertTitle>
              <AlertDescription>{t('insight.setup.unavailableDescription')}</AlertDescription>
            </Alert>

            <div className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>{t('insight.setup.paragraph1')}</p>
              <p>{t('insight.setup.paragraph2')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href={WITTY_INSIGHT_PROJECT_URL} target="_blank" rel="noreferrer">
                  {t('insight.setup.viewProject')}
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('insight.setup.capabilitiesTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {capabilities.map(item => (
                  <div key={item.labelKey} className="flex items-start gap-3 rounded-lg border p-3">
                    <div className="mt-0.5 rounded-md bg-muted p-2 text-foreground">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">
                        {t(item.labelKey)}
                      </div>
                      <div className="text-xs leading-5 text-muted-foreground">
                        {t(item.descriptionKey)}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('insight.setup.stepsTitle')}</CardTitle>
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
