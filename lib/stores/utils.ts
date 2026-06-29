import type React from 'react'
import type { MCPTool } from '../types'

export function syncUrlParams(agentId?: string, sessionId?: string) {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (agentId) params.set('agent', agentId)
  else params.delete('agent')
  if (sessionId) params.set('session', sessionId)
  else params.delete('session')
  const qs = params.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  language: 'zh-CN' | 'en-US'
}

export interface Tab {
  id: string
  name: string
  icon?: React.ElementType
  color?: string
}

export const defaultTools: MCPTool[] = [
  {
    id: 'web-search',
    name: '网络搜索',
    description: '搜索互联网获取最新信息',
    category: 'search',
    enabled: true,
  },
  {
    id: 'code-exec',
    name: '代码执行',
    description: '在安全沙箱中执行代码',
    category: 'code',
    enabled: true,
  },
  {
    id: 'file-read',
    name: '文件读取',
    description: '读取和分析上传的文件',
    category: 'file',
    enabled: true,
  },
  {
    id: 'data-analysis',
    name: '数据分析',
    description: '分析和可视化数据',
    category: 'data',
    enabled: true,
  },
  {
    id: 'web-browse',
    name: '网页浏览',
    description: '访问和提取网页内容',
    category: 'web',
    enabled: false,
  },
  {
    id: 'image-gen',
    name: '图像生成',
    description: '根据描述生成图像',
    category: 'system',
    enabled: false,
  },
]
