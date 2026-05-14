'use client'

import type { ElementType, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { skillService } from '@/services/skill-service'

interface RepoFormState {
  source_type: SkillRepositorySourceType
  url: string
  branch: string
  local_path: string
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
  local_path: '',
}

export function SkillRepoManagement() {
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
    () => repos.some((repo) => isInProgressStatus(repo.skill_discover_status)),
    [repos],
  )

  const filteredRepos = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase()
    if (!keyword) {
      return repos
    }

    return repos.filter((repo) =>
      [
        repo.source_type,
        repo.url,
        repo.local_path,
        repo.branch,
        repo.skill_discover_status,
        String(repo.skill_num ?? ''),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(keyword)),
    )
  }, [repos, searchTerm])

  useEffect(() => {
    void fetchRepos()
  }, [])

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
  }, [hasDiscoveringRepo])

  useEffect(() => {
    if (!editingRepo) {
      return
    }

    setEditForm(buildFormStateFromRepository(editingRepo))
  }, [editingRepo])

  const fetchRepos = async () => {
    try {
      setLoading(true)
      const repositories = await skillService.listRepositoryResponses()
      setRepos(repositories)
    } catch (error) {
      console.error('Failed to fetch skill repos:', error)
      toast({
        title: '加载失败',
        description: '无法获取仓库源列表，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const refreshDiscoverStatuses = async (silent = false) => {
    try {
      const repositories = await skillService.listRepositoryResponses()
      setRepos(repositories)
    } catch (error) {
      console.error('Failed to refresh discover statuses:', error)
      if (!silent) {
        toast({
          title: '刷新失败',
          description: '无法更新扫描状态，请稍后重试。',
          variant: 'destructive',
        })
      }
    }
  }

  const resetCreateForm = () => {
    setCreateForm(initialFormState)
  }

  const openCreateDialog = (sourceType: SkillRepositorySourceType) => {
    setCreateForm({
      ...initialFormState,
      source_type: sourceType,
    })
    setIsCreateOpen(true)
  }

  const handleCreate = async () => {
    const request = buildCreatePayload(createForm)
    if (!request) {
      toast({
        title: '表单不完整',
        description:
          createForm.source_type === 'git'
            ? '请填写仓库地址。分支可选填写。'
            : '请填写本地导入路径。',
        variant: 'destructive',
      })
      return
    }

    try {
      setSubmitting(true)
      await skillService.createRepo(request)
      toast({
        title: '创建成功',
        description: '仓库源已添加。',
      })
      setIsCreateOpen(false)
      resetCreateForm()
      await fetchRepos()
    } catch (error) {
      console.error('Failed to create repo:', error)
      toast({
        title: '创建失败',
        description: '仓库源创建失败，请检查信息后重试。',
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
        title: '没有可提交的修改',
        description:
          editingRepo.source_type === 'git'
            ? '请修改分支信息后再保存。'
            : '请修改本地路径后再保存。',
      })
      return
    }

    try {
      setSubmitting(true)
      const updatedRepo = await skillService.updateRepo(
        editingRepo.repo_id,
        request,
        editingRepo,
      )
      setRepos((currentRepos) =>
        currentRepos.map((repo) => (repo.repo_id === updatedRepo.repo_id ? updatedRepo : repo)),
      )
      setEditingRepo(null)
      toast({
        title: '更新成功',
        description: '仓库源配置已保存。',
      })
    } catch (error) {
      console.error('Failed to update repo:', error)
      toast({
        title: '更新失败',
        description: '仓库源更新失败，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (repo: SkillRepositoryResponse) => {
    if (!window.confirm('确认删除该仓库源吗？')) {
      return
    }

    try {
      await skillService.deleteRepo(repo.repo_id)
      setRepos((currentRepos) => currentRepos.filter((item) => item.repo_id !== repo.repo_id))
      toast({
        title: '删除成功',
        description: '仓库源已移除。',
      })
    } catch (error) {
      console.error('Failed to delete repo:', error)
      toast({
        title: '删除失败',
        description: '仓库源删除失败，请稍后重试。',
        variant: 'destructive',
      })
    }
  }

  const handleDiscoverRepo = async (repo: SkillRepositoryResponse) => {
    try {
      setUpdatingRepoIds((currentIds) => new Set(currentIds).add(repo.repo_id))
      setRepos((currentRepos) => upsertDiscoverStatus(currentRepos, repo))
      await skillService.discoverRepoSkills(repo.repo_id)
      await refreshDiscoverStatuses(true)
      toast({
        title: '更新已触发',
        description: '已开始更新该仓库的技能信息。',
      })
    } catch (error) {
      console.error('Failed to discover repo skills:', error)
      toast({
        title: '更新失败',
        description: '无法更新该仓库的技能信息，请稍后重试。',
        variant: 'destructive',
      })
    } finally {
      setUpdatingRepoIds((currentIds) => {
        const nextIds = new Set(currentIds)
        nextIds.delete(repo.repo_id)
        return nextIds
      })
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm leading-6 text-muted-foreground">
        统一管理技能来源，支持直接新增 Git 源和本地源。
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <CreateSourceCard
          title="新增 Git 源"
          description="添加远程 Git 仓库地址，分支可按需填写。"
          onClick={() => openCreateDialog('git')}
        />
        <CreateSourceCard
          title="新增本地源"
          description="添加本地目录或压缩包路径，作为技能来源。"
          onClick={() => openCreateDialog('local')}
        />
      </div>

      <Card className="border border-border">
        <CardHeader className="gap-1">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>仓库源列表</CardTitle>
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索仓库"
              className="max-w-xl"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <Card className="border border-dashed border-border">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                正在加载仓库源列表...
              </CardContent>
            </Card>
          ) : filteredRepos.length === 0 ? (
            <Card className="border border-dashed border-border">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                暂无匹配的仓库源，请先新增 Git 仓库或本地导入源。
              </CardContent>
            </Card>
          ) : (
            <div className="divide-y divide-border">
              {filteredRepos.map((repo) => {
                const location = getRepositoryLocation(repo)
                const statusDisplay = getRepositoryStatusDisplay(repo)
                const isUpdating = updatingRepoIds.has(repo.repo_id)

                return (
                  <div
                    key={repo.repo_id}
                    className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <InlineInfo icon={location.icon} label={location.label} value={location.value} />
                      <CompactMetaRow>
                        {repo.source_type === 'git' ? (
                          <CompactMeta label="分支" value={repo.branch || '默认分支'} />
                        ) : null}
                        {statusDisplay.mode === 'discovering' ? (
                          <CompactStatus label={statusDisplay.label} status={statusDisplay.status} />
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
                        更新
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingRepo(repo)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-600"
                        onClick={() => void handleDelete(repo)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除
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
            <DialogTitle>{createForm.source_type === 'git' ? '新增 Git 源' : '新增本地源'}</DialogTitle>
            <DialogDescription>
              {createForm.source_type === 'git'
                ? '请填写 Git 仓库地址；如有需要，可补充分支信息。'
                : '请填写本地目录或压缩包路径。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {createForm.source_type === 'git' ? (
              <>
                <FormField label="仓库地址" description="请输入可访问的 Git 仓库地址。">
                  <Input
                    value={createForm.url}
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({ ...currentForm, url: event.target.value }))
                    }
                    placeholder="请输入 Git 仓库 URL"
                  />
                </FormField>
                <FormField label="分支" description="可选；不填写时使用默认分支。">
                  <Input
                    value={createForm.branch}
                    onChange={(event) =>
                      setCreateForm((currentForm) => ({ ...currentForm, branch: event.target.value }))
                    }
                    placeholder="例如：main 或 master"
                  />
                </FormField>
              </>
            ) : (
              <FormField label="本地路径" description="支持填写本地目录或压缩包路径。">
                <Input
                  value={createForm.local_path}
                  onChange={(event) =>
                    setCreateForm((currentForm) => ({ ...currentForm, local_path: event.target.value }))
                  }
                  placeholder="例如：/root/skills/repo 或 /tmp/skills.zip"
                />
              </FormField>
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
              取消
            </Button>
            <Button onClick={() => void handleCreate()} disabled={submitting}>
              {submitting ? '提交中...' : createForm.source_type === 'git' ? '创建 Git 源' : '创建本地源'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingRepo} onOpenChange={(open) => !open && setEditingRepo(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>编辑仓库源</DialogTitle>
            <DialogDescription>您可以在这里调整当前仓库源的关键信息。</DialogDescription>
          </DialogHeader>
          {editingRepo ? (
            <div className="space-y-4 pt-2">
              <FormField label="来源类型">
                <Input value={editingRepo.source_type === 'git' ? 'Git' : '本地导入'} disabled />
              </FormField>
              {editingRepo.source_type === 'git' ? (
                <>
                  <FormField label="仓库地址" description="当前来源地址仅用于展示。">
                    <Input value={editingRepo.url || ''} disabled />
                  </FormField>
                  <FormField label="分支" description="更新后，系统将基于新的分支继续同步内容。">
                    <Input
                      value={editForm.branch}
                      onChange={(event) =>
                        setEditForm((currentForm) => ({ ...currentForm, branch: event.target.value }))
                      }
                      placeholder="例如：main"
                    />
                  </FormField>
                </>
              ) : (
                <FormField label="本地路径" description="请填写新的本地目录或压缩包路径。">
                  <Input
                    value={editForm.local_path}
                    onChange={(event) =>
                      setEditForm((currentForm) => ({ ...currentForm, local_path: event.target.value }))
                    }
                    placeholder="请输入新的本地路径"
                  />
                </FormField>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRepo(null)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={() => void handleUpdate()} disabled={submitting || !editingRepo}>
              {submitting ? '保存中...' : '保存修改'}
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
    local_path: repo.local_path || '',
  }
}

function getRepositoryLocation(repo: SkillRepositoryResponse): RepositoryLocation {
  if (repo.source_type === 'git') {
    return {
      label: 'Git 地址',
      value: repo.url ?? undefined,
    }
  }

  return {
    icon: FolderOpen,
    label: '本地路径',
    value: repo.local_path ?? undefined,
  }
}

function getRepositoryStatusDisplay(
  status?: SkillRepositoryResponse,
): RepositoryStatusDisplay {
  if (isInProgressStatus(status?.skill_discover_status)) {
    return {
      mode: 'discovering',
      label: '扫描状态',
      status: status?.skill_discover_status,
    }
  }

  if (status?.skill_discover_status === 'done') {
    return {
      mode: 'meta',
      label: '识别技能',
      value: typeof status.skill_num === 'number' ? `${status.skill_num} 个` : '暂无数据',
    }
  }

  return {
    mode: 'meta',
    label: '扫描状态',
    value: formatDiscoverStatusText(status?.skill_discover_status),
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
        <span className="break-all">{value || '未提供'}</span>
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
      <span>{label}：</span>
      <span className="break-all">{value || '未提供'}</span>
    </div>
  )
}

function CompactStatus({
  label,
  status,
}: {
  label: string
  status?: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
      <span>{label}：</span>
      <DiscoverStatusBadge status={status} />
    </div>
  )
}

function DiscoverStatusBadge({ status }: { status?: string }) {
  const statusMeta = getDiscoverStatusMeta(status)

  return (
    <Badge variant="outline" className={cn('h-5 px-1.5 text-[11px] font-normal', statusMeta.className)}>
      {statusMeta.label}
    </Badge>
  )
}

function formatDiscoverStatusText(status?: string) {
  return getDiscoverStatusMeta(status).label
}

function isInProgressStatus(status?: string) {
  return getDiscoverStatusMeta(status).inProgress
}

function getDiscoverStatusMeta(status?: string) {
  if (status === 'init') {
    return {
      label: '初始化中',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      inProgress: true,
    }
  }

  if (status === 'discovering') {
    return {
      label: '发现中',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
      inProgress: true,
    }
  }

  if (status === 'done') {
    return {
      label: '已完成',
      className: 'border-green-200 bg-green-50 text-green-700',
      inProgress: false,
    }
  }

  if (status === 'failed') {
    return {
      label: '失败',
      className: 'border-red-200 bg-red-50 text-red-700',
      inProgress: false,
    }
  }

  return {
    label: '暂无数据',
    className: 'border-border bg-muted text-muted-foreground',
    inProgress: false,
  }
}

function upsertDiscoverStatus(
  currentStatuses: SkillRepositoryResponse[],
  repo: SkillRepositoryResponse,
): SkillRepositoryResponse[] {
  const nextStatuses = currentStatuses.map((item) =>
    item.repo_id === repo.repo_id
      ? {
          ...item,
          skill_discover_status: 'discovering',
        }
      : item,
  )

  if (nextStatuses.some((item) => item.repo_id === repo.repo_id)) {
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

function buildCreatePayload(form: RepoFormState): SkillRepositoryRequest | null {
  if (form.source_type === 'git') {
    if (!form.url.trim()) {
      return null
    }

    const nextBranch = form.branch.trim()
    return {
      source_type: 'git',
      url: form.url.trim(),
      ...(nextBranch ? { branch: nextBranch } : {}),
    }
  }

  if (!form.local_path.trim()) {
    return null
  }

  return {
    source_type: 'local',
    local_path: form.local_path.trim(),
  }
}

function buildUpdatePayload(
  repo: SkillRepositoryResponse,
  form: RepoFormState,
): SkillRepositoryRequest | null {
  if (repo.source_type === 'git') {
    const nextBranch = form.branch.trim()
    if (nextBranch === (repo.branch || '')) {
      return null
    }
    return { branch: nextBranch }
  }

  const nextLocalPath = form.local_path.trim()
  if (!nextLocalPath || nextLocalPath === (repo.local_path || '')) {
    return null
  }

  return { local_path: nextLocalPath }
}
