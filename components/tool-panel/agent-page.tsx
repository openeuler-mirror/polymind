'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, RefreshCw, Plus, Trash2, Play, Pause, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { agentService } from '@/services/agent-service'
import { Agent, AgentStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AgentCreatePage } from './agent-create-page'

export function AgentPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all')
  const [isCreating, setIsCreating] = useState(() => {
    // 从localStorage中获取状态，默认为false
    const storedState = localStorage.getItem('agentIsCreating')
    return storedState ? JSON.parse(storedState) : false
  })
  const { toast } = useToast()

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
        duration: 1000
      })
      console.error('Failed to fetch agents:', err)
    } finally {
      setLoading(false)
    }
  }

  // 初始化加载
  useEffect(() => {
    fetchAgents()
  }, [])

  // 处理智能体状态变更
  const handleAgentAction = async (agentId: string, action: 'pause' | 'resume' | 'delete') => {
    try {
      if (action === 'pause') {
        const result = await agentService.pauseAgent(agentId)
        console.log('Pause agent result:', result)
        if (result.error) {
          console.log('Pause agent error:', result.error)
          toast({
            title: '错误',
            description: result.error,
            variant: 'destructive',
            duration: 1000
          })
          return
        }
        if (result.agent) {
          // 更新本地状态中的agent信息
          setAgents(prevAgents => prevAgents.map(agent => 
            agent.id === agentId ? result.agent! : agent
          ))
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
            duration: 1000
          })
          return
        }
        if (result.agent) {
          // 更新本地状态中的agent信息
          setAgents(prevAgents => prevAgents.map(agent => 
            agent.id === agentId ? result.agent! : agent
          ))
        }
      } else if (action === 'delete') {
        await agentService.deleteAgent(agentId)
        // 从本地状态中移除agent
        setAgents(prevAgents => prevAgents.filter(agent => agent.id !== agentId))
      }
    } catch (err) {
      console.error(`Failed to ${action} agent:`, err)
      toast({
        title: '错误',
        description: '操作失败',
        variant: 'destructive',
        duration: 1000
      })
    }
  }

  // 过滤和搜索智能体
  const filteredAgents = agents.filter(agent => {
    // 排除已删除的智能体
    if (agent.status === 'deleted') return false
    
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = agent.name.toLowerCase().includes(searchLower) || 
                        (agent.description && agent.description.toLowerCase().includes(searchLower))
    const matchesFilter = filter === 'all' || agent.status === filter
    return matchesSearch && matchesFilter
  })

  // 获取状态标签样式
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case AgentStatus.RUNNING:
        return 'bg-green-100 text-green-800'
      case AgentStatus.PAUSED:
        return 'bg-yellow-100 text-yellow-800'
      case AgentStatus.STOPPED:
        return 'bg-gray-100 text-gray-800'
      case AgentStatus.ERROR:
        return 'bg-red-100 text-red-800'

      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // 获取状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case AgentStatus.RUNNING:
        return '运行中'

      case AgentStatus.STOPPED:
        return '已停止'
      case AgentStatus.ERROR:
        return '创建/更新失败'
      case AgentStatus.PAUSED:
        return '已暂停'
      default:
        return status
    }
  }

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
    <div className="h-full flex flex-col p-4">
      {/* 头部 */}
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex justify-between items-center max-w-2xl mx-auto w-full">
          <h2 className="text-lg font-semibold">
            {isCreating ? 'Agent 运行时/创建' : 'Agent 运行时'}
          </h2>
        </div>
        
        {!isCreating && (
          <div className="flex items-center gap-2 max-w-2xl mx-auto w-full">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索 Agent..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <Filter className="h-4 w-4" />
                  全部状态
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setFilter('all')}>全部状态</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter(AgentStatus.RUNNING)}>运行中</DropdownMenuItem>

                <DropdownMenuItem onClick={() => setFilter(AgentStatus.STOPPED)}>已停止</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter(AgentStatus.ERROR)}>创建/更新失败</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilter(AgentStatus.PAUSED)}>已暂停</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={fetchAgents}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Button size="sm" onClick={() => setIsCreating(true)}>
                <Plus className="h-4 w-4 mr-1" />
                创建 Agent
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 智能体列表或创建表单 */}
      <div className="flex-1 overflow-y-auto flex justify-center">
        <div className="w-full max-w-2xl">
        {isCreating ? (
          /* 智能体创建表单 */
          <AgentCreatePage 
            onBack={handleBack} 
            onCreated={handleAgentCreated} 
          />
        ) : loading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">加载中...</p>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-muted-foreground">暂无智能体</p>
          </div>
        ) : (
          <div className="space-y-3 flex flex-col items-center">
            {filteredAgents.map((agent) => (
              <Card key={agent.id} className="border border-border w-full max-w-2xl">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-sm font-medium">{agent.name}</CardTitle>
                    <Badge className={cn('text-xs', getStatusBadgeClass(agent.status))}>
                      {getStatusText(agent.status)}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs">
                    {agent.adapterType} • {new Date(agent.createdAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="text-xs text-muted-foreground mb-3">
                    {agent.description || '无描述'}
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex gap-2">
                      {agent.status === AgentStatus.RUNNING ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAgentAction(agent.id, 'pause')}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          暂停
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAgentAction(agent.id, 'resume')}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          启动
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500"
                        onClick={() => handleAgentAction(agent.id, 'delete')}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        删除
                      </Button>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>查看详情</DropdownMenuItem>
                        <DropdownMenuItem>编辑配置</DropdownMenuItem>
                        <DropdownMenuItem>查看日志</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
