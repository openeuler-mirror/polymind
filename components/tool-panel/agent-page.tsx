'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
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
  Check,
  Bot,
  Sparkles,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import { modelService } from '@/services/model-service'
import { AgentStatus, ModelConfig, AgentTemplateInfo, Agent } from '@/lib/types'
import { isTemplateInstantiated } from '@/lib/agent-template-utils'
import { formatDateTime } from '@/lib/date-utils'
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
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs',
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
/** 精选智能体封面色板（更通透的纵深渐变）。 */
const COVER_GRADIENTS = [
  'linear-gradient(135deg,#6366f1 0%,#8b5cf6 45%,#ec4899 100%)',
  'linear-gradient(135deg,#06b6d4 0%,#3b82f6 55%,#6366f1 100%)',
  'linear-gradient(135deg,#f59e0b 0%,#f97316 55%,#ef4444 100%)',
  'linear-gradient(135deg,#10b981 0%,#14b8a6 45%,#0ea5e9 100%)',
  'linear-gradient(135deg,#f43f5e 0%,#d946ef 55%,#8b5cf6 100%)',
  'linear-gradient(135deg,#0ea5e9 0%,#06b6d4 50%,#22d3ee 100%)',
]
function hashString(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}
const avatarGradient = (name: string) =>
  AVATAR_GRADIENTS[hashString(name || '') % AVATAR_GRADIENTS.length]
const coverGradient = (name: string) =>
  COVER_GRADIENTS[hashString(name || '') % COVER_GRADIENTS.length]

/** 头像文本：中文取首字，英文取前两词首字母。 */
function avatarLabel(name: string) {
  const s = (name || '').trim()
  if (!s) return '?'
  if (/[\u4e00-\u9fa5]/.test(s)) return s.slice(0, 1)
  return s.slice(0, 2).toUpperCase()
}

/** 区块标题（图标 + 主标题）。 */
function SectionHeader({ icon, title }: { icon?: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      {icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {icon}
        </span>
      )}
      <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
    </div>
  )
}

/**
 * 精选智能体横向滚动容器：
 * - 隐藏原生滚动条，改用左右翻页按钮；
 * - 右边缘毛玻璃遮罩同样只在右侧仍有内容时出现。
 */
function TemplateCarousel({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const syncScrollState = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const maxScroll = el.scrollWidth - el.clientWidth
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft < maxScroll - 1)
  }, [])

  // 用 ResizeObserver 代替同步 setState：视口尺寸或内容宽度变化后自动重算按钮可见性
  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport) return
    viewport.addEventListener('scroll', syncScrollState, { passive: true })
    const observer = new ResizeObserver(syncScrollState)
    observer.observe(viewport)
    if (track) observer.observe(track)
    return () => {
      viewport.removeEventListener('scroll', syncScrollState)
      observer.disconnect()
    }
  }, [syncScrollState])

  const pageBy = (direction: 1 | -1) => {
    const el = viewportRef.current
    if (!el) return
    // 一次翻约一屏（略小于一屏，露出下一张卡片的边，提示还有更多）
    const step = Math.max(el.clientWidth * 0.85, 260)
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <div
        ref={viewportRef}
        className="overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div ref={trackRef} className="flex gap-4">
          {children}
        </div>
      </div>

      {/* 右边缘毛玻璃遮罩：仅在右侧还有未显示内容时出现 */}
      {canScrollRight && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12">
          <div className="absolute inset-0 backdrop-blur-md [mask-image:linear-gradient(to_left,black,transparent)]" />
          <div className="absolute inset-0 bg-gradient-to-l from-background via-background/60 to-transparent" />
        </div>
      )}

      {/* 左右翻页按钮：常驻 DOM，无未显示内容时用 visibility 隐藏（不卸载、不 disabled） */}
      <button
        type="button"
        aria-label="向左滚动"
        onClick={() => pageBy(-1)}
        className={cn(
          'absolute left-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent',
          !canScrollLeft && 'invisible'
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="向右滚动"
        onClick={() => pageBy(1)}
        className={cn(
          'absolute right-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-accent',
          !canScrollRight && 'invisible'
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

/** 精选智能体卡片（预置模板）：渐变封面 + 描述 + 技能标签 + 一键创建。 */
function FeatureCard({
  template,
  instantiated,
  isInstantiating,
  disabled,
  onClick,
}: {
  template: AgentTemplateInfo
  instantiated: boolean
  isInstantiating: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={
        instantiated
          ? `模板 ${template.name}（已创建，选中该 Agent）`
          : `实例化模板 ${template.name}`
      }
      onClick={disabled ? undefined : onClick}
      onKeyDown={e => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      className={cn(
        'group relative flex w-[300px] shrink-0 flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all duration-200',
        'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5',
        instantiated ? 'border-success/40' : 'border-border',
        disabled && 'cursor-default opacity-60'
      )}
    >
      {/* 封面渐变 */}
      <div
        className="relative h-[84px] shrink-0 overflow-hidden"
        style={{ background: coverGradient(template.name) }}
      >
        <div
          className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/25 blur-2xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-12 left-6 h-20 w-20 rounded-full bg-white/10 blur-2xl"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent"
          aria-hidden
        />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
          <Sparkles className="h-3 w-3" /> 精选推荐
        </div>
        <span className="absolute right-2.5 top-2.5 rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] font-medium text-white/90 backdrop-blur-sm">
          v{template.version}
        </span>
        <div className="absolute inset-x-0 bottom-0 px-3.5 pb-2.5">
          <h3 className="truncate text-[15px] font-semibold leading-tight text-white drop-shadow-sm">
            {template.name}
          </h3>
        </div>
      </div>

      {/* 正文：描述 + 技能标签 */}
      <div className="flex flex-1 flex-col p-3">
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {template.description || '无描述'}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1">
          {template.skills.slice(0, 3).map(skill => (
            <span
              key={skill}
              className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {skill}
            </span>
          ))}
          {template.skillCount > 3 && (
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
              +{template.skillCount - 3}
            </span>
          )}
        </div>
      </div>

      {/* 底部：数量 + 动作（一键创建 / 已创建 / 实例化中） */}
      <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Bot className="h-3.5 w-3.5" /> {template.skillCount} 项技能
        </span>
        {instantiated ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs text-success">
            <Check className="h-3.5 w-3.5" /> 已创建
          </span>
        ) : isInstantiating ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 实例化中
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-xs text-primary-foreground transition-colors group-hover:bg-primary/90">
            一键创建 <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}

/** 我的智能体卡片（运行实例）：头像 + 状态 + 元信息 + 操作。 */
function AgentCard({
  agent,
  processing,
  onPause,
  onResume,
  onDelete,
}: {
  agent: Agent
  processing: boolean
  onPause: () => void
  onResume: () => void
  onDelete: () => void
}) {
  const running = agent.status.toLowerCase() === 'running'
  const hasSkills = (agent.skills?.length ?? 0) > 0
  return (
    <div className="flex flex-col rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-on-gradient/80"
          style={{ background: avatarGradient(agent.name) }}
        >
          {avatarLabel(agent.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="truncate text-[15px] font-semibold leading-snug">{agent.name}</h4>
            <StatusBadge status={agent.status} />
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {agent.description || '无描述'}
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-1.5 py-0.5">{agent.adapterType}</span>
        <span>·</span>
        <span>{formatDateTime(agent.createdAt)}</span>
        {hasSkills && (
          <>
            <span>·</span>
            <span>{agent.skills?.length} 技能</span>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-border/70 pt-3">
        {running ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-full px-2.5 text-xs text-success"
            disabled={processing}
            onClick={e => {
              e.stopPropagation()
              onPause()
            }}
          >
            {processing ? (
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
            disabled={processing}
            onClick={e => {
              e.stopPropagation()
              onResume()
            }}
          >
            {processing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            启动
          </Button>
        )}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 rounded-full px-2.5 text-xs text-destructive"
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 className="h-3 w-3" /> 删除
        </Button>
      </div>
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
  // 预置模板（精选智能体）状态
  const [templates, setTemplates] = useState<AgentTemplateInfo[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateLoadError, setTemplateLoadError] = useState(false)
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
      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-6xl px-6 pb-10">
          {isCreating ? (
            /* 创建子页面：自带顶部留白与返回入口，避免内容直接贴到标签栏下方 */
            <div className="pt-6">
              <div className="mx-auto mb-4 flex w-full max-w-2xl items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  aria-label="返回智能体列表"
                  className="-ml-2 h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" /> 返回
                </Button>
              </div>
              <AgentCreatePage onBack={handleBack} onCreated={handleAgentCreated} />
            </div>
          ) : (
            <>
              {/* 精选智能体 */}
              <section className="pt-6">
                <div className="mb-4">
                  <SectionHeader
                    icon={<Sparkles className="h-4 w-4 text-primary" />}
                    title="精选智能体"
                  />
                </div>

                {instantiatingTemplate && (
                  <div className="mb-4 rounded-xl bg-muted/50 p-3">
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
                  <Empty className="border border-dashed border-border">
                    <EmptyHeader>
                      <Spinner className="h-4 w-4" />
                      <EmptyDescription>加载推荐智能体中...</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : templateLoadError ? (
                  <Empty className="border border-dashed border-border">
                    <EmptyHeader>
                      <EmptyDescription>无法加载推荐智能体。</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button variant="outline" size="sm" onClick={fetchTemplates}>
                        <RefreshCw className="h-3 w-3" /> 重试
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : templates.length === 0 ? (
                  <Empty className="border border-dashed border-border">
                    <EmptyHeader>
                      <EmptyDescription>暂无推荐智能体</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <TemplateCarousel>
                    {templates.map(template => {
                      const instantiated = isTemplateInstantiated(agents, template)
                      const isInstantiating = instantiatingTemplate === template.name
                      const disabled = instantiatingTemplate !== null
                      return (
                        <FeatureCard
                          key={template.name}
                          template={template}
                          instantiated={instantiated}
                          isInstantiating={isInstantiating}
                          disabled={disabled}
                          onClick={() => handleTemplateClick(template)}
                        />
                      )
                    })}
                  </TemplateCarousel>
                )}
              </section>

              {/* 我的智能体 */}
              <section className="mt-10">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <SectionHeader
                    icon={<Bot className="h-4 w-4 text-primary" />}
                    title="我的智能体"
                  />
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="搜索 Agent..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-8 w-40"
                      />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          title={filterLabel}
                          className={cn(
                            'h-8 w-8',
                            filter !== 'all' && 'border-primary/40 text-primary'
                          )}
                        >
                          <Filter className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setFilter('all')}>
                          全部状态
                        </DropdownMenuItem>
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
                    <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                      <Download className="h-4 w-4" /> 导入
                    </Button>
                    <Button size="sm" onClick={() => setIsCreating(true)}>
                      <Plus className="h-4 w-4" /> 创建
                    </Button>
                  </div>
                </div>

                {loading ? (
                  <Empty className="border border-dashed border-border">
                    <EmptyHeader>
                      <Spinner className="h-4 w-4" />
                      <EmptyDescription>加载中...</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : filteredAgents.length === 0 ? (
                  <Empty className="border border-dashed border-border">
                    <EmptyHeader>
                      <EmptyDescription>暂无以当前筛选条件匹配的智能体</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {filteredAgents.map(agent => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        processing={processingAgentId === agent.id}
                        onPause={() => handleAgentAction(agent.id, 'pause')}
                        onResume={() => handleAgentAction(agent.id, 'resume')}
                        onDelete={() => setDeleteAgentId(agent.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
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
