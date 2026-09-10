'use client'

import { useEffect, useMemo, useState } from 'react'
import { GitCompareArrows, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  BackportPrerequisiteCandidate,
  BackportPrerequisiteManifest,
} from '@/lib/backport-types'

interface PrerequisiteReviewPanelProps {
  manifest: BackportPrerequisiteManifest
  initialSelected: BackportPrerequisiteCandidate[]
  rescanning?: boolean
  onCancel: () => void
  onConfirm: (selected: BackportPrerequisiteCandidate[]) => void
  onRescan: () => void
}

export function PrerequisiteReviewPanel({
  manifest,
  initialSelected,
  rescanning = false,
  onCancel,
  onConfirm,
  onRescan,
}: PrerequisiteReviewPanelProps) {
  const { t } = useTranslation('tool-panel')
  const [query, setQuery] = useState('')
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set())

  const candidates = useMemo(() => manifest.candidates || [], [manifest.candidates])
  const targetRef = manifest.target_ref || ''
  const originalCount = manifest.original_units?.length ?? 0

  useEffect(() => {
    setQuery('')
    setSelectedSet(new Set(initialSelected.map(candidate => candidate.commit)))
  }, [manifest, initialSelected])

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return candidates
    return candidates.filter(
      candidate =>
        (candidate.title || '').toLowerCase().includes(normalizedQuery) ||
        (candidate.commit || '').toLowerCase().includes(normalizedQuery)
    )
  }, [candidates, query])

  const selected = useMemo(
    () => candidates.filter(candidate => selectedSet.has(candidate.commit)),
    [candidates, selectedSet]
  )

  const toggle = (commit: string, checked: boolean): void => {
    setSelectedSet(previous => {
      const next = new Set(previous)
      if (checked) {
        next.add(commit)
      } else {
        next.delete(commit)
      }
      return next
    })
  }

  const toggleFiltered = (checked: boolean): void => {
    setSelectedSet(previous => {
      const next = new Set(previous)
      for (const candidate of filtered) {
        if (checked) {
          next.add(candidate.commit)
        } else {
          next.delete(candidate.commit)
        }
      }
      return next
    })
  }

  const handleConfirm = (): void => {
    onConfirm(selected)
  }

  return (
    <Card className="gap-0 overflow-hidden border-l-4 border-l-primary py-0">
      <CardHeader className="border-b py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitCompareArrows className="size-5" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <CardTitle>{t('backport.prereq.title')}</CardTitle>
              <CardDescription>{t('backport.prereq.description')}</CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t('backport.prereq.originalCount', { count: originalCount })}</Badge>
            <Badge variant="outline">
              {t('backport.prereq.suggestedCount', { count: candidates.length })}
            </Badge>
            {targetRef ? (
              <Badge variant="secondary" className="font-mono">
                {t('backport.prereq.targetBaseline', { ref: targetRef.slice(0, 12) })}
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 py-5">
        {manifest.decision_tasks && manifest.decision_tasks.length > 0 ? (
          <Alert>
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>{t('backport.prereq.decisionAlertTitle')}</AlertTitle>
            <AlertDescription>
              {t('backport.prereq.decisionAlertDescription', {
                count: manifest.decision_tasks.length,
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <InputGroup className="max-w-xl">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('backport.prereq.searchPlaceholder')}
            aria-label={t('backport.prereq.searchAriaLabel')}
            className="font-mono text-xs"
          />
        </InputGroup>

        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table className="min-w-6xl">
            <TableHeader className="sticky top-0 bg-muted">
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      filtered.length > 0 &&
                      filtered.every(candidate => selectedSet.has(candidate.commit))
                    }
                    onCheckedChange={checked => toggleFiltered(checked === true)}
                    aria-label={t('backport.prereq.selectAllAriaLabel')}
                    disabled={rescanning}
                  />
                </TableHead>
                <TableHead className="w-40">Commit</TableHead>
                <TableHead className="min-w-80">{t('backport.prereq.columnTitle')}</TableHead>
                <TableHead className="min-w-96">{t('backport.prereq.columnWhyNeeded')}</TableHead>
                <TableHead className="min-w-72">
                  {t('backport.prereq.columnRequiredBy')}
                </TableHead>
                <TableHead className="w-28">{t('backport.prereq.columnOrigin')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    {t('backport.prereq.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map(candidate => {
                  const checked = selectedSet.has(candidate.commit)
                  const capabilities = candidate.capabilities || []
                  const requiredBy = candidate.required_by || []

                  return (
                    <TableRow key={candidate.commit} data-state={checked ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={value => toggle(candidate.commit, value === true)}
                          aria-label={t('backport.prereq.selectCommitAriaLabel', {
                            commit: candidate.commit,
                          })}
                          disabled={rescanning}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <span title={candidate.commit}>{candidate.commit.slice(0, 12)}</span>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <p
                          className="line-clamp-3 text-sm font-medium"
                          title={candidate.title || ''}
                        >
                          {candidate.title || '--'}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <p
                          className="line-clamp-3 text-xs leading-relaxed text-muted-foreground"
                          title={capabilities.join('；')}
                        >
                          {capabilities.length > 0 ? capabilities.join('；') : '--'}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {requiredBy.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {requiredBy.map(commit => (
                              <Badge key={commit} variant="outline" className="font-mono">
                                {commit.slice(0, 12)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={candidate.origin === 'deterministic' ? 'secondary' : 'outline'}
                        >
                          {candidate.origin === 'deterministic'
                            ? t('backport.prereq.originDeterministic')
                            : candidate.origin}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col-reverse gap-3 border-t py-4 sm:flex-row sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {t('backport.prereq.footerHint', { count: selected.length })}
        </p>
        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <Button variant="ghost" onClick={onCancel} disabled={rescanning}>
            {t('backport.prereq.cancelReview')}
          </Button>
          <Button variant="outline" onClick={onRescan} disabled={rescanning}>
            <RefreshCw
              data-icon="inline-start"
              className={rescanning ? 'animate-spin' : undefined}
            />
            {t('backport.prereq.rescan')}
          </Button>
          <Button onClick={handleConfirm} disabled={rescanning}>
            {selected.length > 0
              ? t('backport.prereq.confirmWithCount', { count: selected.length })
              : t('backport.prereq.confirmWithoutSelection')}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
