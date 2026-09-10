'use client'

import type { ElementType, ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import i18n from '@/lib/i18n/config'
import { CheckCircle, FolderOpen, Pencil, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
  SkillRepositoryRequest,
  SkillRepositoryResponse,
  SkillRepositorySourceType,
} from '@/lib/types'
import { extractApiErrorMessage } from '@/lib/error-handler'
import { cn } from '@/lib/utils'
import { skillService } from '@/services/skill-service'

interface RepoFormState {
  source_type: SkillRepositorySourceType
  url: string
  branch: string
  uploaded_file?: File
}

type RepositoryLocation = {
  icon?: ElementType
  label: string
  value?: string
}

type RepositoryStatusDisplay =
  | {
      mode: 'discovering'
      label: string
      status?: string
    }
  | {
      mode: 'meta'
      label: string
      value: string
    }

const initialFormState: RepoFormState = {
  source_type: 'git',
  url: '',
  branch: '',
}

export function SkillRepoManagement() {
  const { t } = useTranslation('settings')
  const [repos, setRepos] = useState<SkillRepositoryResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [updatingRepoIds, setUpdatingRepoIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingRepo, setEditingRepo] = useState<SkillRepositoryResponse | null>(null)
  const [createForm, setCreateForm] = useState<RepoFormState>(initialFormState)
  const [editForm, setEditForm] = useState<RepoFormState>(initialFormState)
  const { toast } = useToast()

  const hasDiscoveringRepo = useMemo(
    () => repos.some(repo => isInProgressStatus(repo.skill_discover_status)),
    [repos]
  )

  const filteredRepos = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) {
      return repos
    }

    return repos.filter(repo =>
      [
        repo.source_type,
        repo.url,
        repo.local_path,
        repo.branch,
        repo.skill_discover_status,
        String(repo.skill_num ?? ''),
      ]
        .filter(Boolean)
        .some(value => value!.toLowerCase().includes(keyword))
    )
  }, [repos, searchTerm])

  const fetchRepos = useCallback(async () => {
    try {
      setLoading(true)
      const repositories = await skillService.listRepositoryResponses()
      setRepos(repositories)
    } catch (error) {
      console.error('Failed to fetch skill repos:', error)
      toast({
        title: t('skill.repo.toast.loadFailed'),
        description: extractApiErrorMessage(error, t('skill.repo.toast.loadFailedDesc')),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  const refreshDiscoverStatuses = useCallback(
    async (silent = false) => {
      try {
        const repositories = await skillService.listRepositoryResponses()
        setRepos(repositories)
      } catch (error) {
        console.error('Failed to refresh discover statuses:', error)
        if (!silent) {
          toast({
            title: t('skill.repo.toast.refreshFailed'),
            description: extractApiErrorMessage(error, t('skill.repo.toast.refreshFailedDesc')),
            variant: 'destructive',
          })
        }
      }
    },
    [t, toast]
  )

  const resetCreateForm = useCallback(() => {
    setCreateForm({ ...initialFormState, uploaded_file: undefined })
  }, [])

  const openCreateDialog = useCallback((sourceType: SkillRepositorySourceType) => {
    setCreateForm({
      ...initialFormState,
      source_type: sourceType,
      uploaded_file: undefined,
    })
    setIsCreateOpen(true)
  }, [])

  const openEditDialog = useCallback((repo: SkillRepositoryResponse) => {
    setEditForm(buildFormStateFromRepository(repo))
    setEditingRepo(repo)
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchRepos()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [fetchRepos])

  useEffect(() => {
    if (!hasDiscoveringRepo) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshDiscoverStatuses(true)
    }, 2000)

    return () => {
      window.clearInterval(timer)
    }
  }, [hasDiscoveringRepo, refreshDiscoverStatuses])

  const validateUploadFile = (file: File) => {
    const isZipFile =
      file.name.toLowerCase().endsWith('.zip') ||
      file.type === 'application/zip' ||
      file.type === 'application/x-zip-compressed'

    if (!isZipFile) {
      toast({
        title: t('skill.repo.toast.fileFormatError'),
        description: t('skill.repo.toast.fileFormatErrorDesc'),
        variant: 'destructive',
      })
      return false
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: t('skill.repo.toast.fileTooLarge'),
        description: t('skill.repo.toast.fileTooLargeDesc'),
        variant: 'destructive',
      })
      return false
    }

    return true
  }

  const handleCreate = async () => {
    if (createForm.source_type === 'local' && createForm.uploaded_file) {
      try {
        setSubmitting(true)
        await skillService.uploadRepoArchive(createForm.uploaded_file)
        toast({
          title: t('skill.repo.toast.createSuccess'),
          description: t('skill.repo.toast.uploadArchiveSuccessDesc'),
        })
        setIsCreateOpen(false)
        resetCreateForm()
        await fetchRepos()
      } catch (error) {
        console.error('Failed to upload repo archive:', error)
        toast({
          title: t('skill.repo.toast.uploadFailed'),
          description: extractApiErrorMessage(error, t('skill.repo.toast.uploadFailedDesc')),
          variant: 'destructive',
        })
      } finally {
        setSubmitting(false)
      }
      return
    }

    const request = buildCreatePayload(createForm)
    if (!request) {
      toast({
        title: t('skill.repo.toast.formIncomplete'),
        description:
          createForm.source_type === 'git'
            ? createForm.url.trim()
              ? t('skill.repo.toast.invalidGitUrl')
              : t('skill.repo.toast.gitUrlRequired')
            : t('skill.repo.toast.zipRequired'),
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)
      await skillService.createRepo(request)
      toast({
        title: t('skill.repo.toast.createSuccess'),
        description: t('skill.repo.toast.createSuccessDesc'),
      })
      setIsCreateOpen(false)
      resetCreateForm()
      await fetchRepos()
    } catch (error) {
      console.error('Failed to create repo:', error)
      toast({
        title: t('skill.repo.toast.createFailed'),
        description: extractApiErrorMessage(error, t('skill.repo.toast.createFailedDesc')),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdate = async () => {
    if (!editingRepo) {
      return
    }

    const request = buildUpdatePayload(editingRepo, editForm)
    if (!request) {
      toast({
        title: t('skill.repo.toast.noChanges'),
        description:
          editingRepo.source_type === 'git'
            ? t('skill.repo.toast.noChangesBranch')
            : t('skill.repo.toast.noChangesPath'),
      })
      return
    }

    try {
      setSubmitting(true)
      const updatedRepo = await skillService.updateRepo(editingRepo.repo_id, request, editingRepo)
      setRepos(currentRepos =>
        currentRepos.map(repo => (repo.repo_id === updatedRepo.repo_id ? updatedRepo : repo))
      )
      setEditingRepo(null)
      toast({
        title: t('skill.repo.toast.updateSuccess'),
        description: t('skill.repo.toast.updateSuccessDesc'),
      })
    } catch (error) {
      console.error('Failed to update repo:', error)
      toast({
        title: t('skill.repo.toast.updateFailed'),
        description: extractApiErrorMessage(error, t('skill.repo.toast.updateFailedDesc')),
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (repo: SkillRepositoryResponse) => {
    if (!window.confirm(t('skill.repo.confirmDelete'))) {
      return
    }

    try {
      await skillService.deleteRepo(repo.repo_id)
      setRepos(currentRepos => currentRepos.filter(item => item.repo_id !== repo.repo_id))
      toast({
        title: t('skill.repo.toast.deleteSuccess'),
        description: t('skill.repo.toast.deleteSuccessDesc'),
      })
    } catch (error) {
      console.error('Failed to delete repo:', error)
      toast({
        title: t('skill.repo.toast.deleteFailed'),
        description: extractApiErrorMessage(error, t('skill.repo.toast.deleteFailedDesc')),
        variant: 'destructive',
      })
    }
  }

  const handleDiscoverRepo = async (repo: SkillRepositoryResponse) => {
    try {
      setUpdatingRepoIds(currentIds => new Set(currentIds).add(repo.repo_id))
      setRepos(currentRepos => upsertDiscoverStatus(currentRepos, repo))
      await skillService.discoverRepoSkills(repo.repo_id)
      await refreshDiscoverStatuses(true)
      toast({
        title: t('skill.repo.toast.discoverTriggered'),
        description: t('skill.repo.toast.discoverTriggeredDesc'),
      })
    } catch (error) {
      console.error('Failed to discover repo skills:', error)
      toast({
        title: t('skill.repo.toast.updateFailed'),
        description: extractApiErrorMessage(error, t('skill.repo.toast.discoverFailedDesc')),
        variant: 'destructive',
      })
    } finally {
      setUpdatingRepoIds(currentIds => {
        const nextIds = new Set(currentIds)
        nextIds.delete(repo.repo_id)
        return nextIds
      })
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-muted-foreground">{t('skill.repo.description')}</p>

      <div className="grid gap-4 md:grid-cols-2">
        <CreateSourceCard
          title={t('skill.repo.createGitTitle')}
          description={t('skill.repo.createGitDescription')}
          onClick={() => openCreateDialog('git')}
        />
        <CreateSourceCard
          title={t('skill.repo.createLocalTitle')}
          description={t('skill.repo.createLocalDescription')}
          onClick={() => openCreateDialog('local')}
        />
      </div>

      <Card className="border border-border">
        <CardHeader className="gap-1">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>{t('skill.repo.listTitle')}</CardTitle>
            <Input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder={t('skill.repo.searchPlaceholder')}
              className="max-w-xl"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <Card className="border border-dashed border-border">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('skill.repo.loading')}
              </CardContent>
            </Card>
          ) : filteredRepos.length === 0 ? (
            <Card className="border border-dashed border-border">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('skill.repo.empty')}
              </CardContent>
            </Card>
          ) : (
            <div className="divide-y divide-border">
              {filteredRepos.map(repo => {
                const location = getRepositoryLocation(repo, t)
                const statusDisplay = getRepositoryStatusDisplay(repo, t)
                const isUpdating = updatingRepoIds.has(repo.repo_id)

                return (
                  <div
                    key={repo.repo_id}
                    className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <InlineInfo
                        icon={location.icon}
                        label={location.label}
                        value={location.value}
                      />
                      <CompactMetaRow>
                        {repo.source_type === 'git' ? (
                          <CompactMeta label={t('skill.repo.branch')} value={repo.branch || t('skill.repo.defaultBranch')} />
                        ) : null}
                        {statusDisplay.mode === 'discovering' ? (
                          <CompactStatus
                            label={statusDisplay.label}
                            status={statusDisplay.status}
                          />
                        ) : (
                          <CompactMeta label={statusDisplay.label} value={statusDisplay.value} />
                        )}
                      </CompactMetaRow>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-1 self-end lg:self-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDiscoverRepo(repo)}
                        disabled={isUpdating}
                      >
                        <RefreshCw className={cn('mr-2 h-4 w-4', isUpdating && 'animate-spin')} />
                        {t('skill.repo.action.update')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(repo)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('skill.repo.action.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-600"
                        onClick={() => void handleDelete(repo)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t('skill.repo.action.delete')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {createForm.source_type === 'git'
                ? t('skill.repo.createGitTitle')
                : t('skill.repo.createLocalTitle')}
            </DialogTitle>
            <DialogDescription>
              {createForm.source_type === 'git'
                ? t('skill.repo.createGitDialogDescription')
                : t('skill.repo.createLocalDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {createForm.source_type === 'git' ? (
              <>
                <FormField
                  label={t('skill.repo.field.repoUrl')}
                  description={t('skill.repo.field.repoUrlDesc')}
                >
                  <Input
                    value={createForm.url}
                    onChange={event =>
                      setCreateForm(currentForm => ({ ...currentForm, url: event.target.value }))
                    }
                    placeholder={t('skill.repo.field.repoUrlPlaceholder')}
                  />
                </FormField>
                <FormField
                  label={t('skill.repo.field.branch')}
                  description={t('skill.repo.field.branchDesc')}
                >
                  <Input
                    value={createForm.branch}
                    onChange={event =>
                      setCreateForm(currentForm => ({ ...currentForm, branch: event.target.value }))
                    }
                    placeholder={t('skill.repo.field.branchPlaceholder')}
                  />
                </FormField>
              </>
            ) : (
              <>
                <FormField
                  label={t('skill.repo.field.uploadArchive')}
                  description={t('skill.repo.field.uploadArchiveDesc')}
                >
                  <div className="mt-2">
                    <div
                      className={cn(
                        'flex h-32 items-center justify-center rounded-lg border-2 border-dashed transition-colors',
                        createForm.uploaded_file
                          ? 'border-green-500 bg-green-50'
                          : 'border-border hover:border-primary hover:bg-primary/5'
                      )}
                      onDragOver={event => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onDragLeave={event => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onDrop={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        const file = event.dataTransfer.files?.[0]
                        if (!file) return
                        if (!validateUploadFile(file)) {
                          return
                        }
                        setCreateForm(currentForm => ({
                          ...currentForm,
                          uploaded_file: file,
                        }))
                      }}
                    >
                      <input
                        type="file"
                        accept=".zip"
                        className="hidden"
                        id="repo-upload"
                        onChange={event => {
                          const file = event.target.files?.[0]
                          if (!file) return
                          if (!validateUploadFile(file)) {
                            event.target.value = ''
                            return
                          }
                          setCreateForm(currentForm => ({
                            ...currentForm,
                            uploaded_file: file,
                          }))
                        }}
                      />
                      <label
                        htmlFor="repo-upload"
                        className="flex cursor-pointer flex-col items-center gap-2 text-sm text-muted-foreground hover:text-primary"
                      >
                        {createForm.uploaded_file ? (
                          <>
                            <CheckCircle className="h-8 w-8 text-green-500" />
                            <span className="text-green-600 font-medium">
                              {createForm.uploaded_file.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {t('skill.repo.upload.replaceHint')}
                            </span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8" />
                            <span>{t('skill.repo.upload.hint')}</span>
                            <span className="text-xs">{t('skill.repo.upload.maxSize')}</span>
                          </>
                        )}
                      </label>
                    </div>
                    {createForm.uploaded_file && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-8 px-2 text-xs text-red-600 hover:text-red-600"
                        onClick={() =>
                          setCreateForm(currentForm => ({
                            ...currentForm,
                            uploaded_file: undefined,
                          }))
                        }
                      >
                        <X className="mr-1 h-3 w-3" />
                        {t('skill.repo.upload.removeFile')}
                      </Button>
                    )}
                  </div>
                </FormField>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateOpen(false)
                resetCreateForm()
              }}
              disabled={submitting}
            >
              {t('common:action.cancel')}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={submitting}>
              {submitting
                ? t('skill.repo.action.submitting')
                : createForm.source_type === 'git'
                  ? t('skill.repo.action.createGit')
                  : t('skill.repo.action.createLocal')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRepo} onOpenChange={open => !open && setEditingRepo(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('skill.repo.editTitle')}</DialogTitle>
            <DialogDescription>{t('skill.repo.editDescription')}</DialogDescription>
          </DialogHeader>
          {editingRepo ? (
            <div className="space-y-4 pt-2">
              <FormField label={t('skill.repo.field.editHint')}>
                <Input
                  value={
                    editingRepo.source_type === 'git'
                      ? t('skill.repo.field.editableGit')
                      : t('skill.repo.field.notEditable')
                  }
                  disabled
                />
              </FormField>
              {editingRepo.source_type === 'git' ? (
                <>
                  <FormField
                    label={t('skill.repo.field.repoUrl')}
                    description={t('skill.repo.field.repoUrlReadonlyDesc')}
                  >
                    <Input value={editingRepo.url || ''} disabled />
                  </FormField>
                  <FormField
                    label={t('skill.repo.field.branch')}
                    description={t('skill.repo.field.branchEditDesc')}
                  >
                    <Input
                      value={editForm.branch}
                      onChange={event =>
                        setEditForm(currentForm => ({ ...currentForm, branch: event.target.value }))
                      }
                      placeholder={t('skill.repo.field.branchEditPlaceholder')}
                    />
                  </FormField>
                </>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRepo(null)} disabled={submitting}>
              {t('common:action.cancel')}
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={submitting || !editingRepo}>
              {submitting ? t('skill.repo.action.saving') : t('skill.repo.action.saveChanges')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function buildFormStateFromRepository(repo: SkillRepositoryResponse): RepoFormState {
  return {
    source_type: repo.source_type === 'local' ? 'local' : 'git',
    url: repo.url || '',
    branch: repo.branch || '',
  }
}

function getRepositoryLocation(
  repo: SkillRepositoryResponse,
  t: TFunction
): RepositoryLocation {
  if (repo.source_type === 'git') {
    return {
      label: t('skill.repo.location.gitUrl'),
      value: repo.url ?? undefined,
    }
  }

  return {
    icon: FolderOpen,
    label: t('skill.repo.location.packageName'),
    value: repo.repo_name ?? undefined,
  }
}

function getRepositoryStatusDisplay(
  status: SkillRepositoryResponse | undefined,
  t: TFunction
): RepositoryStatusDisplay {
  if (isInProgressStatus(status?.skill_discover_status)) {
    return {
      mode: 'discovering',
      label: t('skill.repo.status.scanStatus'),
      status: status?.skill_discover_status,
    }
  }

  if (status?.skill_discover_status === 'done') {
    return {
      mode: 'meta',
      label: t('skill.repo.status.recognizedSkills'),
      value:
        typeof status.skill_num === 'number'
          ? t('skill.repo.status.skillCount', { count: status.skill_num })
          : t('common:status.empty'),
    }
  }

  return {
    mode: 'meta',
    label: t('skill.repo.status.scanStatus'),
    value: formatDiscoverStatusText(status?.skill_discover_status, t),
  }
}

function InlineInfo({
  icon: Icon,
  label,
  value,
}: {
  icon?: ElementType
  label: string
  value?: string
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
      <div className="min-w-0">
        <span className="mr-2 text-muted-foreground">{label}</span>
        <span className="break-all">{value || i18n.t('common:status.notProvided')}</span>
      </div>
    </div>
  )
}

function CompactMetaRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-xs text-muted-foreground">
      {children}
    </div>
  )
}

function CompactMeta({
  icon: Icon,
  label,
  value,
}: {
  icon?: ElementType
  label: string
  value?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
      <span>{i18n.t('common:labelWithColon', { label })}</span>
      <span className="break-all">{value || i18n.t('common:status.notProvided')}</span>
    </div>
  )
}

function CompactStatus({ label, status }: { label: string; status?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
      <span>{i18n.t('common:labelWithColon', { label })}</span>
      <DiscoverStatusBadge status={status} />
    </div>
  )
}

function DiscoverStatusBadge({ status }: { status?: string }) {
  const statusMeta = getDiscoverStatusMeta(status)

  return (
    <Badge
      variant="outline"
      className={cn('h-5 px-1.5 text-[11px] font-normal', statusMeta.className)}
    >
      {statusMeta.label}
    </Badge>
  )
}

function formatDiscoverStatusText(status: string | undefined, t: TFunction) {
  return getDiscoverStatusMeta(status, t).label
}

function isInProgressStatus(status?: string) {
  return getDiscoverStatusMeta(status).inProgress
}

function getDiscoverStatusMeta(status?: string, t?: TFunction) {
  const translate = t ?? i18n.t.bind(i18n)
  if (status === 'init') {
    return {
      label: translate('skill.repo.discoverStatus.init'),
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      inProgress: true,
    }
  }

  if (status === 'discovering') {
    return {
      label: translate('skill.repo.discoverStatus.discovering'),
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      inProgress: true,
    }
  }

  if (status === 'done') {
    return {
      label: translate('skill.repo.discoverStatus.done'),
      className: 'border-green-200 bg-green-50 text-green-700',
      inProgress: false,
    }
  }

  if (status === 'failed') {
    return {
      label: translate('common:status.failed'),
      className: 'border-red-200 bg-red-50 text-red-700',
      inProgress: false,
    }
  }

  return {
    label: translate('common:status.empty'),
    className: 'border-border bg-muted text-muted-foreground',
    inProgress: false,
  }
}

function upsertDiscoverStatus(
  currentStatuses: SkillRepositoryResponse[],
  repo: SkillRepositoryResponse
): SkillRepositoryResponse[] {
  const nextStatuses = currentStatuses.map(item =>
    item.repo_id === repo.repo_id
      ? {
          ...item,
          skill_discover_status: 'discovering',
        }
      : item
  )

  if (nextStatuses.some(item => item.repo_id === repo.repo_id)) {
    return nextStatuses
  }

  return [
    ...nextStatuses,
    {
      ...repo,
      skill_discover_status: 'discovering',
    },
  ]
}

function CreateSourceCard({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start rounded-xl border border-border bg-muted/10 p-4 text-left transition-colors hover:bg-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Plus className="h-4 w-4 text-muted-foreground" />
          <span>{title}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}

function FormField({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  )
}

function isValidGitUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  const httpsPattern = /^https?:\/\/[^\s]+/
  const sshPattern = /^(?:ssh:\/\/)?(?:[\w.-]+@)?[\w.-]+:[^\s]+/
  const gitProtocolPattern = /^git:\/\/[^\s]+/
  return httpsPattern.test(trimmed) || sshPattern.test(trimmed) || gitProtocolPattern.test(trimmed)
}

function buildCreatePayload(form: RepoFormState): SkillRepositoryRequest | null {
  if (form.source_type === 'git') {
    if (!form.url.trim()) {
      return null
    }

    if (!isValidGitUrl(form.url)) {
      return null
    }

    const nextBranch = form.branch.trim()
    return {
      source_type: 'git',
      url: form.url.trim(),
      ...(nextBranch ? { branch: nextBranch } : {}),
    }
  }

  return null
}

function buildUpdatePayload(
  repo: SkillRepositoryResponse,
  form: RepoFormState
): SkillRepositoryRequest | null {
  if (repo.source_type === 'git') {
    const nextBranch = form.branch.trim()
    if (nextBranch === (repo.branch || '')) {
      return null
    }
    return { branch: nextBranch }
  }

  return null
}
