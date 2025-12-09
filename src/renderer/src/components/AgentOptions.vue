<template>
  <div class="w-full h-full flex flex-col overflow-hidden">

    <!-- Agent列表 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 空状态 -->
      <div
        v-if="filteredAgents.length === 0"
        class="flex flex-col items-center justify-center h-32 text-center p-4"
      >
        <Icon icon="lucide:package" class="w-8 h-8 text-muted-foreground mb-2" />
        <p class="text-sm text-muted-foreground">{{ t('agents.empty.title') }}</p>
      </div>

      <!-- Agent列表 -->
      <div v-else class="p-2 space-y-1">
        <!-- Agent列表项 -->
        <div
          v-for="agent in filteredAgents"
          :key="agent.id"
          class="flex items-center p-2 rounded-md cursor-pointer transition-colors"
          :class="{
            'bg-slate-200 dark:bg-accent': selectedAgent?.id === agent.id,
            'hover:bg-accent': selectedAgent?.id !== agent.id
          }"
          @click="selectAgent(agent)"
        >
          <div class="flex items-center gap-2 w-full">
            <!-- Agent图标 -->
            <div class="flex-shrink-0 flex items-center justify-center">
              <Icon
                :icon="agent.icon || 'lucide:bot'"
                class="w-4 h-4 text-muted-foreground"
              />
            </div>
            
            <!-- Agent信息 -->
            <div class="flex-1 min-w-0 text-left">
              <span class="text-sm font-medium text-foreground truncate">
                {{ agent.name }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 导入对话框 -->
    <AgentImportDialog
      v-model:show-dialog="showImportDialog"
      @imported="handleAgentImported"
    />

    <!-- 创建智能体对话框 -->
    <AgentCreateDialog
      v-model:show-dialog="showCreateDialog"
      @created="handleAgentCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { usePresenter } from '@/composables/usePresenter'
import { useChatStore } from '@/stores/chat'
import AgentImportDialog from '@/components/agent-config/AgentImportDialog.vue'
import AgentCreateDialog from '@/components/agent-config/AgentCreateDialog.vue'
import type { Agent } from '@shared/presenter'

const { t } = useI18n()
const configPresenter = usePresenter('configPresenter')
const chatStore = useChatStore()

// 搜索查询
const searchQuery = ref('')

// Agent数据
const agents = ref<Agent[]>([])
const installedAgentsOrder = ref<string[]>([])

// 本地选中的智能体
const selectedAgent = ref<Agent | null>(null)

// 对话框状态
const showImportDialog = ref(false)
const showCreateDialog = ref(false)

// 加载Agent数据
const loadAgents = async () => {
  try {
    const agentsData = await configPresenter.getAgents()
    agents.value = agentsData
    
    // 获取已安装agent的顺序
    const agentConfHelper = (configPresenter as any).agentConfHelper
    if (agentConfHelper && agentConfHelper.store) {
      installedAgentsOrder.value = agentConfHelper.store.get('installedAgents') || []
    }
  } catch (error) {
    console.error('Failed to load agents:', error)
    agents.value = []
    installedAgentsOrder.value = []
  }
}

// 筛选后的Agent列表 - 仅显示已安装的agent
const filteredAgents = computed(() => {
  // 首先筛选已安装的agent，保持原始顺序（新添加的显示在最后面）
  const installedAgents = agents.value.filter(agent => agent.installed)
  
  if (!searchQuery.value.trim()) {
    return installedAgents
  }

  const query = searchQuery.value.toLowerCase().trim()
  return installedAgents.filter(agent =>
    agent.name.toLowerCase().includes(query) ||
    agent.description.toLowerCase().includes(query) ||
    (agent.skills && agent.skills.some(skill =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query)
    ))
  )
})

// 选择Agent
const selectAgent = async (agent: Agent) => {
  selectedAgent.value = agent
  console.log('Selected agent:', agent.name)
  
  // 获取会话列表
  const threads = chatStore.threads
  
  if (threads.length > 0 && threads[0].dtThreads.length > 0) {
    // 如果有历史会话，打开最新的一个
    const latestThread = threads[0].dtThreads[0]
    console.log('Opening latest thread:', latestThread.title)
    await chatStore.setActiveThread(latestThread.id)
  } else {
    // 如果没有历史会话，创建一个新会话
    console.log('Creating new thread with agent:', agent.name)
    const threadId = await chatStore.createThread(`与 ${agent.name} 对话`, {
      systemPrompt: agent.description || '',
      providerId: '',
      modelId: '',
      temperature: 0.7,
      contextLength: 32000,
      maxTokens: 8000,
      artifacts: 0
    })
    console.log('Created new thread:', threadId)
  }
  
  // 延迟切换到历史记录标签页，确保会话已创建
  nextTick(() => {
    // 通过事件总线或直接操作父组件来切换标签页
    const sidebarElement = document.querySelector('.chat-sidebar')
    if (sidebarElement) {
      const historyTabButton = sidebarElement.querySelector('button:nth-child(2)') as HTMLElement
      if (historyTabButton) {
        historyTabButton.click()
      }
    }
    
    chatStore.setSelectedAgent(agent)
  })
}

// 处理Agent导入完成
const handleAgentImported = async () => {
  await loadAgents()
}

// 处理Agent创建完成
const handleAgentCreated = async () => {
  await loadAgents()
}

// 设置事件监听器
const setupEventListeners = () => {
  window.electron?.ipcRenderer?.on('agent:agents-updated', (_event, data) => {
    agents.value = data.agents
  })

  window.electron?.ipcRenderer?.on('agent:agent-installed', (_event, data) => {
    const agentIndex = agents.value.findIndex(a => a.id === data.agentId)
    if (agentIndex !== -1) {
      agents.value[agentIndex].installed = true
    }
  })

  window.electron?.ipcRenderer?.on('agent:agent-uninstalled', (_event, data) => {
    const agentIndex = agents.value.findIndex(a => a.id === data.agentId)
    if (agentIndex !== -1) {
      agents.value[agentIndex].installed = false
    }
  })
}

onMounted(async () => {
  await loadAgents()
  setupEventListeners()
})

onBeforeUnmount(() => {
  window.electron?.ipcRenderer?.removeAllListeners('agent:agents-updated')
  window.electron?.ipcRenderer?.removeAllListeners('agent:agent-installed')
  window.electron?.ipcRenderer?.removeAllListeners('agent:agent-uninstalled')
})
</script>

<style scoped>
/* 自定义滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 4px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.3);
  border-radius: 2px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}
</style>