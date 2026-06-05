'use client'

import { useState, useEffect } from 'react'
import {
  Plus,
  Edit,
  Trash2,
  Server,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Power,
  PowerOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { mcpServerService } from '@/services/mcp-server-service'
import { agentService } from '@/services/agent-service'
import { McpServerResponse, CreateMcpServerRequest, UpdateMcpServerRequest } from '@/lib/types'
import { useChatStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'

export function McpPage() {
  const [servers, setServers] = useState<McpServerResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<McpServerResponse | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set())
  const [editedConfigs, setEditedConfigs] = useState<Map<string, string>>(new Map())
  const [editingServerIds, setEditingServerIds] = useState<Set<string>>(new Set())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isEnabling, setIsEnabling] = useState<Set<string>>(new Set())
  const [isDisabling, setIsDisabling] = useState<Set<string>>(new Set())
  const { toast } = useToast()
  const currentAgentId = useChatStore(state => state.currentAgentId)
  const agents = useChatStore(state => state.agents)
  const fetchAgentsWithConversations = useChatStore(state => state.fetchAgentsWithConversations)
  const currentAgent = agents.find(a => a.id === currentAgentId)
  const installedServers = new Set(currentAgent?.mcpServerList || [])

  const [jsonInput, setJsonInput] = useState('')
  const [jsonError, setJsonError] = useState('')

  const defaultJsonExample = `{
  "mcpServers": {
    "example-server": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-server-example"
      ]
    }
  }
}`

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    setIsLoading(true)
    try {
      const serversData = await mcpServerService.getServers()
      setServers(serversData)
    } catch (error) {
      console.error('Failed to load MCP servers:', error)
      toast({
        title: '加载失败',
        description: '无法加载 MCP Server 配置列表',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleEnableMcpServer = async (serverId: string) => {
    if (!currentAgentId) {
      toast({
        title: '请选择 Agent',
        description: '请先选择一个运行中的 Agent',
        variant: 'destructive',
      })
      return
    }

    setIsEnabling(prev => new Set([...prev, serverId]))
    try {
      await agentService.enableMcpServer(currentAgentId, serverId)
      await fetchAgentsWithConversations()
      toast({
        title: '安装成功',
        description: 'MCP Server 已成功安装',
        variant: 'default',
      })
    } catch (error) {
      console.error('Failed to enable MCP server:', error)
      toast({
        title: '安装失败',
        description: '无法安装 MCP Server',
        variant: 'destructive',
      })
    } finally {
      setIsEnabling(prev => {
        const next = new Set(prev)
        next.delete(serverId)
        return next
      })
    }
  }

  const handleDisableMcpServer = async (serverId: string) => {
    if (!currentAgentId) {
      toast({
        title: '请选择 Agent',
        description: '请先选择一个运行中的 Agent',
        variant: 'destructive',
      })
      return
    }

    setIsDisabling(prev => new Set([...prev, serverId]))
    try {
      await agentService.disableMcpServer(currentAgentId, serverId)
      await fetchAgentsWithConversations()
      toast({
        title: '卸载成功',
        description: 'MCP Server 已成功卸载',
        variant: 'default',
      })
    } catch (error) {
      console.error('Failed to disable MCP server:', error)
      toast({
        title: '卸载失败',
        description: '无法卸载 MCP Server',
        variant: 'destructive',
      })
    } finally {
      setIsDisabling(prev => {
        const next = new Set(prev)
        next.delete(serverId)
        return next
      })
    }
  }

  const handleOpenDialog = (server?: McpServerResponse) => {
    setJsonError('')
    setIsSubmitting(false)
    if (server) {
      setEditingServer(server)
      const configJson = JSON.stringify(
        {
          mcpServers: server.mcp_server_config,
        },
        null,
        2
      )
      setJsonInput(configJson)
    } else {
      setEditingServer(null)
      setJsonInput('')
    }
    setIsDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setIsDialogOpen(false)
    setEditingServer(null)
    setJsonError('')
  }

  const validateJson = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString)
      setJsonError('')
      return true
    } catch (e) {
      setJsonError('JSON 解析错误: ' + (e as Error).message)
      return false
    }
  }

  const handleSubmit = async () => {
    if (!validateJson(jsonInput)) {
      return
    }
    setIsSubmitting(true)
    try {
      const parsed = JSON.parse(jsonInput)
      const mcpServerConfig = parsed.mcpServers

      if (editingServer) {
        const serverName = Object.keys(mcpServerConfig)[0]
        const request: UpdateMcpServerRequest = {
          mcp_server_name: serverName,
          mcp_server_config: mcpServerConfig,
        }
        await mcpServerService.updateServer(editingServer.id, request)
      } else {
        const request: CreateMcpServerRequest = {
          mcp_server_config: mcpServerConfig,
        }
        await mcpServerService.createServer(request)
      }
      handleCloseDialog()
      loadServers()
    } catch (error) {
      console.error('Failed to save MCP server:', error)
      toast({
        title: '保存失败',
        description: editingServer ? '无法更新 MCP Server 配置' : '无法创建 MCP Server 配置',
        variant: 'destructive',
      })
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    try {
      await mcpServerService.deleteServer(deleteTarget.id)
      setDeleteTarget(null)
      loadServers()
    } catch (error) {
      console.error('Failed to delete MCP server:', error)
      toast({
        title: '删除失败',
        description: '无法删除 MCP Server 配置',
        variant: 'destructive',
      })
    }
  }

  const toggleConfig = (id: string) => {
    setExpandedConfigs(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
      }
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const formatJson = (obj: any) => {
    return JSON.stringify(obj, null, 2)
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateString
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">MCP Server 配置管理</h2>
        </div>
        <div className="flex items-center gap-4">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => handleOpenDialog()}>
                <Plus className="w-4 h-4" />
                添加 Server
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>{editingServer ? '编辑 MCP Server' : '添加 MCP Server'}</DialogTitle>
                <DialogDescription>请输入 MCP Server 配置的 JSON 格式数据</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="jsonInput">
                    <span className="text-red-500">*</span> JSON 配置
                  </Label>
                  <Textarea
                    id="jsonInput"
                    value={jsonInput}
                    onChange={e => {
                      setJsonInput(e.target.value)
                      setJsonError('')
                    }}
                    placeholder={defaultJsonExample}
                    className={`min-h-[200px] text-sm ${jsonError ? 'border-red-500' : ''}`}
                  />
                  {jsonError && <p className="text-sm text-red-500">{jsonError}</p>}
                </div>
              </div>

              <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full mt-6">
                {isSubmitting
                  ? editingServer
                    ? '保存中...'
                    : '添加中...'
                  : editingServer
                    ? '保存更改'
                    : '添加 Server'}
              </Button>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : servers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">暂无 MCP Server 配置</p>
            <Button variant="outline" className="mt-4" onClick={() => handleOpenDialog()}>
              添加第一个 Server
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {servers.map(server => {
            const config = server.mcp_server_config[server.mcp_server_name] || {}
            const isExpanded = expandedConfigs.has(server.id)
            const configJson = formatJson(server.mcp_server_config)

            return (
              <Card key={server.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Server className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium">{server.mcp_server_name}</h3>

                        <div className="mt-3">
                          <button
                            onClick={() => toggleConfig(server.id)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                            <span>查看配置详情</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-2 space-y-2">
                              {editingServerIds.has(server.id) ? (
                                <Textarea
                                  value={editedConfigs.get(server.id) || configJson}
                                  onChange={e => {
                                    const updatedConfigs = new Map(editedConfigs)
                                    updatedConfigs.set(server.id, e.target.value)
                                    setEditedConfigs(updatedConfigs)
                                  }}
                                  className="min-h-[120px] text-xs font-mono bg-muted"
                                  readOnly={false}
                                />
                              ) : (
                                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto max-h-48">
                                  <code>{configJson}</code>
                                </pre>
                              )}
                              <div className="flex items-center justify-between">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => copyToClipboard(configJson, server.id)}
                                      >
                                        {copiedId === server.id ? (
                                          <Check className="w-3.5 h-3.5 text-green-500" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5" />
                                        )}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {copiedId === server.id ? '已复制' : '复制配置'}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                                <div className="flex items-center gap-2">
                                  {editingServerIds.has(server.id) ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          setEditingServerIds(prev => {
                                            const next = new Set(prev)
                                            next.delete(server.id)
                                            return next
                                          })
                                          setEditedConfigs(prev => {
                                            const next = new Map(prev)
                                            next.delete(server.id)
                                            return next
                                          })
                                        }}
                                        className="gap-1"
                                      >
                                        取消
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={() => handleOpenDialog(server)}
                                        className="gap-1"
                                      >
                                        <Edit className="w-3 h-3" />
                                        保存修改
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingServerIds(prev => new Set([...prev, server.id]))
                                      }}
                                      className="gap-1"
                                    >
                                      <Edit className="w-3 h-3" />
                                      编辑配置
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={
                                installedServers.has(server.id)
                                  ? 'text-amber-500 hover:text-amber-600'
                                  : 'text-green-500 hover:text-green-600'
                              }
                              onClick={() =>
                                installedServers.has(server.id)
                                  ? handleDisableMcpServer(server.id)
                                  : handleEnableMcpServer(server.id)
                              }
                              disabled={isEnabling.has(server.id) || isDisabling.has(server.id)}
                            >
                              {isEnabling.has(server.id) || isDisabling.has(server.id) ? (
                                <div
                                  className={`w-4 h-4 border-2 ${installedServers.has(server.id) ? 'border-amber-500' : 'border-green-500'} border-t-transparent rounded-full animate-spin`}
                                />
                              ) : installedServers.has(server.id) ? (
                                <PowerOff className="w-4 h-4" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {installedServers.has(server.id) ? '卸载' : '安装'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-red-500 hover:text-red-600"
                                  onClick={() =>
                                    setDeleteTarget({ id: server.id, name: server.mcp_server_name })
                                  }
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>确认删除</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    确定要删除 MCP Server "{deleteTarget?.name}"
                                    吗？此操作无法撤销。
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>取消</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={handleDelete}
                                    className="bg-red-500 hover:bg-red-600"
                                  >
                                    删除
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TooltipTrigger>
                          <TooltipContent>删除</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
