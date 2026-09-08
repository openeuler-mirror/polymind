'use client'

import { useState, useEffect } from 'react'
import {
  Search,
  Filter,
  RefreshCw,
  Plus,
  Trash2,
  Play,
  Pause,
  Loader2,
  Download,
  CheckCircle2,
  Bot,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import { modelService } from '@/services/model-service'
import { AgentStatus, ModelConfig, AgentTemplateInfo } from '@/lib/types'
import { isTemplateInstantiated } from '@/lib/agent-template-utils'
import { cn } from '@/lib/utils'
import { useTemplateInstantiate } from '@/hooks/use-template-instantiate'
import { AgentCreatePage } from './agent-create-page'
import { useChatStore } from '@/lib/store'

/** 参考样式：胶囊型状态徽标（含脉冲圆点）。 */
function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status.toLowerCase()
  const config =
    s === AgentStatus.RUNNING
      ? { dot: 'bg-success', cls: 'bg-success/10 text-success', label: '运行中' }
      : s === AgentStatus.PAUSED
        ? { dot: 'bg-warning', cls: 'bg-warning/10 text-warning', label: '已暂停' }
        : s === AgentStatus.ERROR
          ? {
              dot: 'bg-destructive',
              cls: 'bg-destructive/10 text-destructive',
              label: '创建/更新失败',
            }
          : {
              dot: 'bg-muted-foreground',
              cls: 'bg-muted text-muted-foreground',
              label: status,
            }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        config.cls,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
    </span>
  )
}

/** 头像渐变色板：按名称哈希稳定取色。 */
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#22d3ee,#3b82f6)',
  'linear-gradient(135deg,#34d399,#0ea5e9)',
  'linear-gradient(135deg,#fbbf24,#f97316)',
  'linear-gradient(135deg,#f87171,#fb7185)',
  'linear-gradient(135deg,#a78bfa,#6366f1)',
  'linear-gradient(135deg,#f472b6,#a78bfa)',
]
function hashString(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}
const avatarGradient = (name: string) =>
  AVATAR_GRADIENTS[hashString(name || '') % AVATAR_GRADIENTS.length]

/** 头像文本：中文取首字，英文取前两词首字母。 */
function avatarLabel(name: string) {
  const s = (name || '').trim()
  if (!s) return '?'
  if (/[\u4e00-\u9fa5]/.test(s)) return s.slice(0, 1)
  return s.slice(0, 2).toUpperCase()
}

/** 顶部统计卡。 */
function StatCard({
  label,
  value,
  accentText,
  accentClass,
}: {
  label: string
  value: number
  accentText?: string
  accentClass?: string
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {accentText && (
          <span className={cn('text-[11px] font-medium', accentClass)}>● {accentText}</span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

export function AgentPage() {
  // Agent 列表以全局 store 为唯一来源：与模版墙（agent-template-chips）、侧边栏共享，
  // 任一处的新增/删除/状态变更都会立即反映到其它视图。
  const agents = useChatStore(state => state.agents)
  const setAgents = useChatStore(state => state.setAgents)
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all')
  const [isCreating, setIsCreating] = useState(() => {
    // 从localStorage中获取状态，默认为false
    const storedState = localStorage.getItem('agentIsCreating')
    return storedState ? JSON.parse(storedState) : false
  })
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [processingAgentId, setProcessingAgentId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importForm, setImportForm] = useState({
    gitUrl: '',
    branch: 'main',
    modelId: '',
  })
  const [models, setModels] = useState<ModelConfig[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  // 预置模板（F2）状态
  const [templates, setTemplates] = useState<AgentTemplateInfo[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateLoadError, setTemplateLoadError] = useState(false)
  const [tab, setTab] = useState<'runtime' | 'templates'>('runtime')
  const { toast } = useToast()
  const removeAgent = useChatStore(state => state.removeAgent)
  const updateAgent = useChatStore(state => state.updateAgent)
  const agentCreateFlag = useChatStore(state => state.agentCreateFlag)
  const addAgent = useChatStore(state => state.addAgent)
  const setCurrentAgent = useChatStore(state => state.setCurrentAgent)
  // 实例化流程（含错误分类、选中、刷新）与模版墙共用同一实现
  const { instantiatingTemplate, instantiateTemplate } = useTemplateInstantiate()

  // 监听isCreating状态变化，保存到localStorage
  useEffect(() => {
    localStorage.setItem('agentIsCreating', JSON.stringify(isCreating))
  }, [isCreating])

  // 获取智能体列表
  const fetchAgents = async () => {
    try {
      setLoading(true)
      const data = await agentService.getAgents()
      setAgents(data)
    } catch (err) {
      toast({
        title: '错误',
        description: '获取智能体列表失败',
        variant: 'destructive',
      })
      console.error('Failed to fetch agents:', err)
    } finally {
      setLoading(false)
    }
  }

  // 获取预置模板列表（只读，零网络、零 DB）
  const fetchTemplates = async () => {
    try {
      setTemplatesLoading(true)
      setTemplateLoadError(false)
      const data = await agentService.getAgentTemplates()
      setTemplates(data)
    } catch (err) {
      console.error('Failed to fetch agent templates:', err)
      setTemplateLoadError(true)
    } finally {
      setTemplatesLoading(false)
    }
  }

  // 初始化加载
  useEffect(() => {
    fetchAgents()
    fetchTemplates()
  }, [])

  // 响应来自 AgentSelector 的创建信号
  useEffect(() => {
    if (agentCreateFlag > 0) {
      setIsCreating(true)
    }
  }, [agentCreateFlag])

  // 加载模型列表（当打开导入对话框时）
  useEffect(() => {
    if (importOpen) {
      const fetchModels = async () => {
        try {
          setLoadingModels(true)
          const data = await modelService.getModels()
          setModels(data)
        } catch (err) {
          console.error('Failed to fetch models:', err)
        } finally {
          setLoadingModels(false)
        }
      }
      fetchModels()
    }
  }, [importOpen])

  // 处理智能体状态变更
  const handleAgentAction = async (agentId: string, action: 'pause' | 'resume' | 'delete') => {
    try {
      if (action === 'pause' || action === 'resume') {
        setProcessingAgentId(agentId)
      }

      if (action === 'pause') {
        const result = await agentService.pauseAgent(agentId)
        console.log('Pause agent result:', result)
        if (result.error) {
          console.log('Pause agent error:', result.error)
          toast({
            title: '错误',
            description: result.error,
            variant: 'destructive',
          })
          return
        }
        if (result.agent) {
          // 写入全局 store，模版墙与侧边栏同步可见
          updateAgent(result.agent)
        }
      } else if (action === 'resume') {
        const result = await agentService.resumeAgent(agentId)
        console.log('Resume agent result:', result)
        if (result.error) {
          console.log('Resume agent error:', result.error)
          toast({
            title: '错误',
            description: result.error,
            variant: 'destructive',
          })
          return
        }
        if (result.agent) {
          // 写入全局 store，模版墙与侧边栏同步可见
          updateAgent(result.agent)
        }
      } else if (action === 'delete') {
        setIsDeleting(true)
        await agentService.deleteAgent(agentId)
        // 从全局 store 移除：同步到 conversation-sidebar 与模版墙（「已创建」状态回退）
        removeAgent(agentId)
        toast({
          title: '成功',
          description: 'Agent 已删除',
        })
        setDeleteAgentId(null)
        setIsDeleting(false)
      }
    } catch (err) {
      console.error(`Failed to ${action} agent:`, err)
      toast({
        title: '错误',
        description: '操作失败',
        variant: 'destructive',
      })
      if (action === 'delete') {
        setIsDeleting(false)
        setDeleteAgentId(null)
      }
    } finally {
      if (action === 'pause' || action === 'resume') {
        setProcessingAgentId(null)
      }
    }
  }

  // 处理从AgentHub导入
  const handleImportFromHub = async () => {
    if (!importForm.gitUrl.trim()) {
      toast({
        title: '错误',
        description: '请输入Git仓库地址',
        variant: 'destructive',
      })
      return
    }

    if (!importForm.modelId) {
      toast({
        title: '错误',
        description: '请选择模型配置',
        variant: 'destructive',
      })
      return
    }

    try {
      setIsImporting(true)
      const newAgent = await agentService.importAgentFromHub({
        git_url: importForm.gitUrl,
        branch: importForm.branch || 'main',
        sandbox_type: 'local_process',
        adapter_type: 'openclaw',
        idle_timeout_seconds: 300,
        model_id: importForm.modelId,
      })
      // 添加到全局store
      addAgent(newAgent)
      setCurrentAgent(newAgent.id)
      toast({
        title: '成功',
        description: '从AgentHub导入智能体成功',
      })
      setImportForm({ gitUrl: '', branch: 'main', modelId: '' })
      setImportOpen(false)
      fetchAgents()
    } catch (err) {
      console.error('Failed to import agent from hub:', err)
      toast({
        title: '错误',
        description: '从AgentHub导入智能体失败',
        variant: 'destructive',
      })
    } finally {
      setIsImporting(false)
    }
  }

  // 模板点击：复用共享 hook（已实例化 → 选中；否则 → 取默认模型 → 一键实例化）
  const handleTemplateClick = async (template: AgentTemplateInfo) => {
    await instantiateTemplate(template)
  }

  // 过滤和搜索智能体
  const filteredAgents = agents.filter(agent => {
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch =
      agent.name.toLowerCase().includes(searchLower) ||
      (agent.description && agent.description.toLowerCase().includes(searchLower))
    const matchesFilter = filter === 'all' || agent.status.toLowerCase() === filter.toLowerCase()
    return matchesSearch && matchesFilter
  })

  const runningCount = agents.filter(a => a.status.toLowerCase() === 'running').length
  const pausedCount = agents.filter(a => a.status.toLowerCase() === 'paused').length
  const errorCount = agents.filter(a => a.status.toLowerCase() === 'error').length
  const filterLabel =
    filter === AgentStatus.RUNNING
      ? '运行中'
      : filter === AgentStatus.ERROR
        ? '创建/更新失败'
        : filter === AgentStatus.PAUSED
          ? '已暂停'
          : '全部状态'

  // 处理返回按钮
  const handleBack = () => {
    setIsCreating(false)
  }

  // 处理智能体创建成功
  const handleAgentCreated = () => {
    // 刷新智能体列表
    fetchAgents()
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 头部：标题 + 操作 */}
      <div className="pt-5 pb-4">
        <div className="mx-auto flex w-full max-w-3xl items-end justify-between gap-4 px-6">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">智能体</h2>
            <p className="mt-1 text-xs text-muted-foreground">管理运行实例与预置模版</p>
          </div>
          {!isCreating && (
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <Download className="h-4 w-4" /> 导入 Agent
              </Button>
              <Button size="sm" onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4" /> 创建 Agent
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-3xl px-6 pb-8">
          {isCreating ? (
            <AgentCreatePage onBack={handleBack} onCreated={handleAgentCreated} />
          ) : (
            <>
              {/* 概览统计 */}
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  label="运行实例"
                  value={agents.length}
                  accentText={runningCount + ' 运行中'}
                  accentClass="text-success"
                />
                <StatCard label="已暂停" value={pausedCount} />
                <StatCard label="创建失败" value={errorCount} />
                <StatCard label="预置模版" value={templates.length} />
              </div>

              {/* 运行实例 / 模版 切换 */}
              <div className="mb-4 flex w-fit items-center gap-1 rounded-full bg-muted/60 p-1">
                <button
                  type="button"
                  onClick={() => setTab('runtime')}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm transition-colors',
                    tab === 'runtime'
                      ? 'bg-foreground text-background font-semibold'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  运行实例
                </button>
                <button
                  type="button"
                  onClick={() => setTab('templates')}
                  className={cn(
                    'rounded-full px-4 py-1.5 text-sm transition-colors',
                    tab === 'templates'
                      ? 'bg-foreground text-background font-semibold'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  模版
                </button>
              </div>

              {/* 搜索与过滤 */}
              <div className="mb-4 flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索 Agent..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-8 w-64"
                  />
                </div>
                {tab === 'runtime' && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="flex items-center gap-1">
                        <Filter className="h-4 w-4" /> {filterLabel}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setFilter('all')}>全部状态</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilter(AgentStatus.RUNNING)}>
                        运行中
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilter(AgentStatus.ERROR)}>
                        创建/更新失败
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setFilter(AgentStatus.PAUSED)}>
                        已暂停
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button variant="outline" size="sm" onClick={fetchAgents}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>

              {tab === 'templates' ? (
                <>
                  {instantiatingTemplate && (
                    <div className="mb-4 p-3 bg-muted/50 rounded-md">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                          <span
                            className="w-2 h-2 rounded-full bg-primary/60 animate-pulse"
                            style={{ animationDelay: '0.2s' }}
                          ></span>
                          <span
                            className="w-2 h-2 rounded-full bg-primary/30 animate-pulse"
                            style={{ animationDelay: '0.4s' }}
                          ></span>
                        </div>
                        <span>
                          正在创建「{instantiatingTemplate}」，此过程可能需要1-2分钟，请耐心等待...
                        </span>
                      </div>
                    </div>
                  )}
                  {templatesLoading ? (
                    <div className="flex items-center justify-center h-24 gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> 加载模板中...
                    </div>
                  ) : templateLoadError ? (
                    <div className="flex items-center justify-between gap-3 border border-dashed rounded-md p-4">
                      <span className="text-sm text-muted-foreground">无法加载预置模板。</span>
                      <Button variant="outline" size="sm" onClick={fetchTemplates}>
                        <RefreshCw className="h-3 w-3 mr-1" /> 重试
                      </Button>
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="border border-dashed rounded-md p-4 text-sm text-muted-foreground">
                      暂无预置模板
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {templates.map(template => {
                        const instantiated = isTemplateInstantiated(agents, template)
                        const isInstantiating = instantiatingTemplate === template.name
                        const disabled = instantiatingTemplate !== null
                        return (
                          <div
                            key={template.name}
                            role="button"
                            tabIndex={disabled ? -1 : 0}
                            aria-disabled={disabled}
                            aria-label={
                              instantiated
                                ? `模板 ${template.name}（已创建，选中该 Agent）`
                                : `实例化模板 ${template.name}`
                            }
                            onClick={disabled ? undefined : () => handleTemplateClick(template)}
                            onKeyDown={e => {
                              if (disabled) return
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                handleTemplateClick(template)
                              }
                            }}
                            className={cn(
                              'group relative flex flex-col rounded-[14px] border bg-card p-4 text-left cursor-pointer transition-all',
                              'hover:border-primary/40 hover:shadow-sm',
                              instantiated ? 'border-success/40' : 'border-border',
                              disabled && 'opacity-60 cursor-default'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-on-gradient/80"
                                style={{ background: avatarGradient(template.name) }}
                              >
                                {avatarLabel(template.name)}
                              </div>
                              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                v{template.version}
                              </span>
                            </div>
                            <div className="mt-3 truncate text-[15px] font-semibold leading-snug">
                              {template.name}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {template.description || '无描述'}
                            </p>
                            <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <Bot className="h-3.5 w-3.5" /> {template.skillCount} 技能 ·
                                @PolyMind
                              </span>
                              {instantiated ? (
                                <Badge
                                  variant="secondary"
                                  className="shrink-0 gap-1 px-2 py-0.5 text-[11px]"
                                >
                                  <CheckCircle2 className="h-3 w-3" /> 已创建
                                </Badge>
                              ) : isInstantiating ? (
                                <span className="flex items-center gap-1 text-[11px] text-primary">
                                  <Loader2 className="h-3 w-3 animate-spin" /> 实例化中
                                </span>
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors group-hover:bg-primary/90"
                                >
                                  <Plus className="h-4 w-4" />
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              ) : loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="ml-2 text-muted-foreground">加载中...</p>
                </div>
              ) : filteredAgents.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">暂无智能体</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredAgents.map(agent => (
                    <div
                      key={agent.id}
                      className="flex items-center gap-4 rounded-[14px] border border-border bg-card p-4 transition-colors hover:border-primary/30"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-on-gradient/80"
                        style={{ background: avatarGradient(agent.name) }}
                      >
                        {avatarLabel(agent.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-semibold leading-snug">
                          {agent.name}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {agent.description || '无描述'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <StatusBadge status={agent.status} />
                        <div className="text-[11px] text-muted-foreground">
                          {agent.adapterType} · {new Date(agent.createdAt).toLocaleString()}
                        </div>
                        <div className="flex gap-1.5">
                          {agent.status.toLowerCase() === 'running' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-full px-2.5 text-xs text-success"
                              onClick={() => handleAgentAction(agent.id, 'pause')}
                              disabled={processingAgentId === agent.id}
                            >
                              {processingAgentId === agent.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Pause className="h-3 w-3" />
                              )}
                              暂停
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-full px-2.5 text-xs text-success"
                              onClick={() => handleAgentAction(agent.id, 'resume')}
                              disabled={processingAgentId === agent.id}
                            >
                              {processingAgentId === agent.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                              启动
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 rounded-full px-2.5 text-xs text-destructive"
                            onClick={() => setDeleteAgentId(agent.id)}
                          >
                            <Trash2 className="h-3 w-3" /> 删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* 删除确认对话框 */}
      <AlertDialog
        open={deleteAgentId !== null}
        onOpenChange={open => !open && !isDeleting && setDeleteAgentId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 Agent</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将永久删除该 Agent，所有相关配置和运行数据都将丢失，无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>取消</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => deleteAgentId && handleAgentAction(deleteAgentId, 'delete')}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                '确认删除'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 从AgentHub导入对话框 */}
      <AlertDialog open={importOpen} onOpenChange={setImportOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>从 AgentHub 导入</AlertDialogTitle>
            <AlertDialogDescription>
              从远程 Git 仓库导入 Agent 模板，解析 agent.yaml 后自动创建 Agent。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label htmlFor="gitUrl" className="text-sm font-medium">
                Git 仓库地址 <span className="text-destructive">*</span>
              </label>
              <Input
                id="gitUrl"
                placeholder="https://gitcode.com/username/agent_template.git"
                value={importForm.gitUrl}
                onChange={e => setImportForm(prev => ({ ...prev, gitUrl: e.target.value }))}
                disabled={isImporting}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="branch" className="text-sm font-medium">
                分支
              </label>
              <Input
                id="branch"
                placeholder="main"
                value={importForm.branch}
                onChange={e => setImportForm(prev => ({ ...prev, branch: e.target.value }))}
                disabled={isImporting}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="modelId" className="text-sm font-medium">
                模型配置 <span className="text-destructive">*</span>
              </label>
              {!loadingModels && models.length === 0 ? (
                <div className="p-4 border border-input rounded-md bg-muted/50">
                  <span className="text-sm text-muted-foreground">暂无模型配置，请先添加模型</span>
                </div>
              ) : (
                <Select
                  value={importForm.modelId}
                  onValueChange={value => setImportForm(prev => ({ ...prev, modelId: value }))}
                  disabled={isImporting || loadingModels}
                >
                  <SelectTrigger id="modelId" className="w-full">
                    {loadingModels ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        加载中...
                      </div>
                    ) : (
                      <SelectValue placeholder="请选择模型配置" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {models.map(model => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name} ({model.provider})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {isImporting && (
            <div className="mb-4 p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  <span
                    className="w-2 h-2 rounded-full bg-primary/60 animate-pulse"
                    style={{ animationDelay: '0.2s' }}
                  ></span>
                  <span
                    className="w-2 h-2 rounded-full bg-primary/30 animate-pulse"
                    style={{ animationDelay: '0.4s' }}
                  ></span>
                </div>
                <span>正在从 AgentHub 导入智能体，此过程可能需要1-2分钟，请耐心等待...</span>
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>取消</AlertDialogCancel>
            <Button disabled={isImporting} onClick={handleImportFromHub}>
              {isImporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  导入中...
                </>
              ) : (
                '导入'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
