'use client'

import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  GitCommit,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  BackportRepositoryInfo,
  BackportRepositoryPrepareResponse,
  BackportRepositoryRole,
} from '@/lib/backport-types'
import { cn } from '@/lib/utils'

interface RepositoryAccessPanelProps {
  sourceRepository: BackportRepositoryInfo | null
  targetRepository: BackportRepositoryInfo | null
  preparingRole: BackportRepositoryRole | null
  prepareTask: BackportRepositoryPrepareResponse | null
  running: boolean
  expanded: boolean
  headerAction?: ReactNode
  summary?: ReactNode
  collapsedSummary?: ReactNode
  children?: ReactNode
  onAddRepository: (role: BackportRepositoryRole) => void
  onSelectRecentRepository: (role: BackportRepositoryRole) => void
  onRefreshRepository: (role: BackportRepositoryRole) => void
  onBranchChange: (role: BackportRepositoryRole, branch: string) => void
}

const roleLabel = (role: BackportRepositoryRole) => (role === 'source' ? '源仓库' : '目标仓库')

const branchOptions = (repository: BackportRepositoryInfo | null): string[] => {
  if (!repository) return []
  const options = new Set<string>()
  const localBranches = new Set(repository.local_branches.map(item => item.trim()).filter(Boolean))
  for (const item of repository.local_branches) {
    const branch = item.trim()
    if (branch) options.add(branch)
  }
  for (const item of [repository.selected_branch, repository.current_branch, repository.default_branch]) {
    const branch = item.trim()
    if (branch && (localBranches.has(branch) || options.size === 0)) options.add(branch)
  }
  return [...options].slice(0, 120)
}

function StatusLine({
  label,
  value,
  ok,
  muted = false,
}: {
  label: string
  value?: string
  ok: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 text-sm',
        ok ? 'text-slate-700' : 'text-amber-700',
        muted && 'text-slate-500'
      )}
    >
      {muted ? (
        <span className="ml-0.5 h-1 w-1 rounded-full bg-slate-500" />
      ) : ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      )}
      <span>{label}</span>
      {value ? <span className="font-mono text-xs">{value}</span> : null}
    </div>
  )
}

function RepositoryCard({
  role,
  repository,
  preparingRole,
  prepareTask,
  running,
  onAddRepository,
  onSelectRecentRepository,
  onRefreshRepository,
  onBranchChange,
}: {
  role: BackportRepositoryRole
  repository: BackportRepositoryInfo | null
  preparingRole: BackportRepositoryRole | null
  prepareTask: BackportRepositoryPrepareResponse | null
  running: boolean
  onAddRepository: (role: BackportRepositoryRole) => void
  onSelectRecentRepository: (role: BackportRepositoryRole) => void
  onRefreshRepository: (role: BackportRepositoryRole) => void
  onBranchChange: (role: BackportRepositoryRole, branch: string) => void
}) {
  const isPreparing = preparingRole === role && prepareTask?.status === 'running'
  const isFailed = preparingRole === role && prepareTask?.status === 'failed'
  const options = branchOptions(repository)
  const warnings = repository?.warnings || []
  const ready = Boolean(repository)
  const canUse = role === 'source' ? repository?.can_read : repository?.can_write
  const configuredBranch = repository?.selected_branch || repository?.current_branch || repository?.default_branch || ''
  const selectedBranch = options.includes(configuredBranch) ? configuredBranch : options[0] || ''
  const remoteBranchCount = repository?.remote_branches?.length || 0
  const localBranchCount = repository?.local_branches?.length || 0

  return (
    <div className="min-h-[300px]">
      <div className="flex min-h-8 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-slate-950">{roleLabel(role)}</span>
            {ready ? (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px]',
                  canUse
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700'
                )}
              >
                {canUse ? '已就绪' : '需要处理'}
              </Badge>
            ) : null}
          </div>
        </div>
        {ready ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => onRefreshRepository(role)}
            disabled={running || isPreparing}
            title="刷新仓库状态"
          >
            <RefreshCw className={cn('h-4 w-4', isPreparing && 'animate-spin')} />
          </Button>
        ) : null}
      </div>

      {isPreparing ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
            <RefreshCw className="h-4 w-4 animate-spin" />
            正在准备{roleLabel(role)}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-blue-100">
            <div className="h-full bg-blue-600 transition-all" style={{ width: `${prepareTask?.progress || 8}%` }} />
          </div>
          <div className="space-y-1.5">
            {(prepareTask?.steps || []).slice(-4).map((step, index) => (
              <div key={`${step.title}-${index}`} className="flex items-start gap-2 text-xs text-slate-600">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span className="min-w-0">
                  <span>{step.title}</span>
                  {step.detail ? (
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                      {step.detail}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : ready && repository ? (
        <div className="mt-5 space-y-5">
          <div className="min-w-0 space-y-1">
            <div className="truncate text-sm font-semibold text-slate-950">{repository.display_name}</div>
            <div className="truncate font-mono text-xs text-slate-600">
              {repository.source_url || repository.input || repository.local_path}
            </div>
            <div className="truncate font-mono text-xs text-slate-500">
              本地路径：{repository.local_path}
            </div>
          </div>

          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-[72px_minmax(0,1fr)]">
            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <GitBranch className="h-3.5 w-3.5" />
              分支
            </div>
            <Select
              value={selectedBranch}
              onValueChange={(value) => onBranchChange(role, value)}
              disabled={running || options.length === 0}
            >
              <SelectTrigger className="h-8 w-fit min-w-[132px] max-w-full bg-white px-2 text-xs">
                <SelectValue placeholder="选择本地分支" />
              </SelectTrigger>
              <SelectContent>
                {options.map((branch) => (
                  <SelectItem key={branch} value={branch}>
                    {branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5 text-sm text-slate-600">
              <GitCommit className="h-3.5 w-3.5" />
              提交
            </div>
            <div className="truncate font-mono text-sm text-slate-950">{repository.short_head || '--'}</div>
          </div>

          <div className="space-y-2">
            <StatusLine label="本地分支" value={`${localBranchCount} 个`} ok={localBranchCount > 0} />
            {role === 'target' ? (
              <>
                <StatusLine label="写入权限" ok={Boolean(repository.writable)} />
                <StatusLine label={repository.status_clean ? '工作区干净' : '存在未提交修改'} ok={repository.status_clean} />
                {repository.operation_in_progress ? (
                  <StatusLine label="存在未完成 Git 操作" ok={false} />
                ) : null}
              </>
            ) : (
              <>
                <StatusLine label="读取权限" ok={repository.can_read} />
                <StatusLine label="远程分支" value={`${remoteBranchCount} 个`} ok muted={remoteBranchCount === 0} />
              </>
            )}
          </div>

          {warnings.length > 0 ? (
            <div className="flex items-start gap-2 text-xs leading-5 text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warnings[0]}</span>
            </div>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-8" onClick={() => onAddRepository(role)} disabled={running}>
              更换仓库
            </Button>
            <Button variant="ghost" size="sm" className="h-8" onClick={() => onSelectRecentRepository(role)} disabled={running}>
              选择已有
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 flex min-h-[170px] flex-col justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-4">
          <div>
            <div className="text-sm font-medium text-slate-900">尚未选择{roleLabel(role)}</div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              粘贴 Git URL 或服务器本地路径，系统会检测并准备成可用仓库。
            </p>
            {isFailed ? (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{prepareTask?.error || '仓库准备失败'}</span>
              </div>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" className="h-8" onClick={() => onAddRepository(role)} disabled={running}>
              添加新仓库
            </Button>
            <Button variant="outline" size="sm" className="h-8" onClick={() => onSelectRecentRepository(role)} disabled={running}>
              <Search className="mr-1 h-4 w-4" />
              选择已有仓库
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function RepositoryAccessPanel(props: RepositoryAccessPanelProps) {
  if (!props.expanded) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 truncate text-sm text-slate-600">
            <span className="font-medium text-slate-950">回移配置：</span>
            {props.collapsedSummary}
          </div>
          {props.headerAction ? <div className="shrink-0">{props.headerAction}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-950">回移配置</h3>
            <p className="mt-1 text-sm text-slate-500">
              选择源仓库提交，并回移到目标仓库。
            </p>
          </div>
          {props.headerAction ? <div className="shrink-0">{props.headerAction}</div> : null}
        </div>
        {props.expanded && props.summary ? <div>{props.summary}</div> : null}
      </div>

      <div className="grid gap-5 border-t border-slate-200 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] lg:items-stretch">
        <RepositoryCard role="source" repository={props.sourceRepository} {...props} />
        <div className="hidden items-start justify-center pt-12 text-slate-500 lg:flex">
          <ArrowRight className="h-4 w-4" />
        </div>
        <RepositoryCard role="target" repository={props.targetRepository} {...props} />
      </div>
      {props.children ? <div className="border-t border-slate-200 px-4 py-4">{props.children}</div> : null}
    </div>
  )
}
