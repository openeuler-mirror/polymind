<template>
  <div class="w-full h-full flex bg-white/80 dark:bg-black/80">
    <!-- 左侧分类侧边栏 -->
    <CategorySidebar
      :categories="categories"
      :active-category="activeCategory"
      :agents="agents"
      @update:active-category="toggleCategory"
    />

    <!-- 右侧内容区域 -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <!-- 页面标题和搜索栏 -->
      <div class="p-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div class="flex items-center justify-between">
          <!-- 当前分类信息 -->
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon :icon="getCurrentCategoryIcon()" class="w-4 h-4" />
            <span>{{ getCurrentCategoryName() }}</span>
            <span>•</span>
            <span>{{ filteredAgents.length }} {{ t('agents.results') }}</span>
          </div>

          <!-- 搜索和筛选 -->
          <div class="flex items-center gap-3">
            <div class="relative">
              <Icon icon="lucide:search" class="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <input
                type="text"
                :placeholder="t('agents.search.placeholder')"
                class="pl-10 pr-4 py-2 border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent w-56 h-8"
                v-model="searchQuery"
              />
            </div>

            <!-- 导入按钮 -->
            <Button
              variant="outline"
              size="sm"
              @click="showImportDialog = true"
              class="flex items-center gap-2 h-8"
            >
              <Icon icon="lucide:download" class="w-4 h-4" />
              {{ t('agents.import.button') }}
            </Button>
            
            <!-- 创建智能体按钮 -->
            <Button
              variant="default"
              size="sm"
              @click="showCreateDialog = true"
              class="flex items-center gap-2 h-8"
            >
              <Icon icon="lucide:plus" class="w-4 h-4" />
              {{ t('agents.create.button') }}
            </Button>
          </div>
        </div>
      </div>

      <!-- 智能体网格区域 -->
      <div class="flex-1 overflow-y-auto p-6">
        <!-- 空状态 -->
        <div v-if="filteredAgents.length === 0" class="flex flex-col items-center justify-center h-64 text-center">
          <Icon icon="lucide:package" class="w-16 h-16 text-muted-foreground mb-4" />
          <h3 class="text-lg font-medium text-foreground mb-2">{{ t('agents.empty.title') }}</h3>
          <p class="text-muted-foreground max-w-md">{{ t('agents.empty.description') }}</p>
        </div>

        <!-- 智能体网格布局 -->
        <div v-else class="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          <AgentCard
            v-for="agent in filteredAgents"
            :key="agent.id"
            :agent="agent"
            @install="handleInstallAgent"
            @configure="handleConfigureAgent"
            @uninstall="handleUninstallAgent"
            @delete="handleDeleteAgent"
          />
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
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import { Agent } from '@shared/presenter'
import AgentCard from '@/components/agent-config/AgentCard.vue'
import CategorySidebar from '@/components/agent-config//CategorySidebar.vue'
import AgentImportDialog from '@/components/agent-config/AgentImportDialog.vue'
import AgentCreateDialog from '@/components/agent-config/AgentCreateDialog.vue'
import { useToast } from '@/components/ui/toast/use-toast'
import { useI18n } from 'vue-i18n'
import { usePresenter } from '@/composables/usePresenter'
import { Button } from '@/components/ui/button'

const { toast } = useToast()
const { t } = useI18n()

// 搜索查询
const searchQuery = ref('')

const agents = ref<Agent[]>([])

// 导入对话框状态
const showImportDialog = ref(false)

// 创建对话框状态
const showCreateDialog = ref(false)

// 加载智能体数据
const loadAgents = async () => {
  try {
    const configPresenter = usePresenter('configPresenter')
    const agentsData = await configPresenter.getAgents()
    agents.value = agentsData
  } catch (error) {
    console.error('Failed to load agents:', error)
    // 如果加载失败，显示空列表
    agents.value = []
  }
}

// 分类数据 - 使用计算属性确保语言切换时更新
const categories = computed(() => [
  { id: 'my', name: t('agents.categories.my') },
  { id: 'all', name: t('agents.categories.all') },
  { id: 'development', name: t('agents.categories.development') },
  { id: 'productivity', name: t('agents.categories.productivity') },
  { id: 'analytics', name: t('agents.categories.analytics') },
  { id: 'research', name: t('agents.categories.research') },
  { id: 'design', name: t('agents.categories.design') },
  { id: 'support', name: t('agents.categories.support') }
])

const activeCategory = ref('my')


// 计算属性 - 根据分类和搜索筛选智能体
const filteredAgents = computed(() => {
  let filtered = agents.value

  // 按分类筛选
  if (activeCategory.value === 'my') {
    // "我的"分类显示所有分类为'my'的智能体
    filtered = filtered.filter(agent => agent.category === 'my')
  } else if (activeCategory.value !== 'all') {
    // 其他分类显示对应分类的智能体，但排除分类为'my'的智能体
    filtered = filtered.filter(agent => agent.category === activeCategory.value && agent.category !== 'my')
  }

  // 按搜索查询筛选
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    filtered = filtered.filter(agent =>
      agent.name.toLowerCase().includes(query) ||
      agent.description.toLowerCase().includes(query) ||
      (agent.skills && agent.skills.some((skill) =>
            skill.name.toLowerCase().includes(query) ||
            skill.description.toLowerCase().includes(query)
          )) ||
      agent.provider?.organization?.toLowerCase().includes(query)
    )
  }

  return filtered
})

// 获取当前分类图标
const getCurrentCategoryIcon = () => {
  const icons: Record<string, string> = {
    my: 'lucide:user',
    all: 'lucide:grid',
    development: 'lucide:code',
    productivity: 'lucide:edit-3',
    analytics: 'lucide:bar-chart-3',
    research: 'lucide:search',
    design: 'lucide:palette',
    support: 'lucide:headphones'
  }
  return icons[activeCategory.value] || 'lucide:circle'
}

// 获取当前分类名称
const getCurrentCategoryName = () => {
  const category = categories.value.find(cat => cat.id === activeCategory.value)
  return category ? category.name : t('agents.categories.all')
}

// 事件处理函数
const handleInstallAgent = async (agent: Agent) => {
  console.log('安装智能体:', agent.name)
  
  try {
    // 通过 configPresenter 安装智能体
    const configPresenter = usePresenter('configPresenter')
    await configPresenter.installAgent(agent.id)
    
    // 更新本地状态
    const agentIndex = agents.value.findIndex(a => a.id === agent.id)
    if (agentIndex !== -1) {
      agents.value[agentIndex].installed = true
    }
    
    toast({
      title: t('agents.toast.installSuccess.title'),
      description: t('agents.toast.installSuccess.description', { name: agent.name }),
      variant: 'default',
      duration: 3000
    })
  } catch (error) {
    console.error('Failed to install agent:', error)
    toast({
      title: t('agents.toast.installError.title'),
      description: t('agents.toast.installError.description', { name: agent.name }),
      variant: 'destructive',
      duration: 5000
    })
  }
}

const handleConfigureAgent = (agent: Agent) => {
  console.log('配置智能体:', agent.name)
  
  toast({
    title: t('agents.toast.configure.title'),
    description: t('agents.toast.configure.description', { name: agent.name }),
    variant: 'default',
    duration: 3000
  })
}

const handleUninstallAgent = async (agent: Agent) => {
  console.log('卸载智能体:', agent.name)
  
  try {
    // 通过 configPresenter 卸载智能体
    const configPresenter = usePresenter('configPresenter')
    await configPresenter.uninstallAgent(agent.id)
    
    // 更新本地状态
    const agentIndex = agents.value.findIndex(a => a.id === agent.id)
    if (agentIndex !== -1) {
      agents.value[agentIndex].installed = false
    }
    
    toast({
      title: t('agents.toast.uninstallSuccess.title'),
      description: t('agents.toast.uninstallSuccess.description', { name: agent.name }),
      variant: 'default',
      duration: 3000
    })
  } catch (error) {
    console.error('Failed to uninstall agent:', error)
    toast({
      title: t('agents.toast.uninstallError.title'),
      description: t('agents.toast.uninstallError.description', { name: agent.name }),
      variant: 'destructive',
      duration: 5000
    })
  }
}

const handleDeleteAgent = async (agent: Agent) => {
  console.log('删除智能体:', agent.name)
  
  try {
    // 通过 configPresenter 删除智能体
    const configPresenter = usePresenter('configPresenter')
    await configPresenter.removeAgent(agent.id)
    
    // 从本地列表中移除
    const agentIndex = agents.value.findIndex(a => a.id === agent.id)
    if (agentIndex !== -1) {
      agents.value.splice(agentIndex, 1)
    }
    
    toast({
      title: t('agents.toast.deleteSuccess.title'),
      description: t('agents.toast.deleteSuccess.description', { name: agent.name }),
      variant: 'default',
      duration: 3000
    })
  } catch (error) {
    console.error('Failed to delete agent:', error)
    toast({
      title: t('agents.toast.deleteError.title'),
      description: t('agents.toast.deleteError.description', { name: agent.name }),
      variant: 'destructive',
      duration: 5000
    })
  }
}

const toggleCategory = (categoryId: string) => {
  activeCategory.value = categoryId
}

// 监听智能体更新事件
const setupEventListeners = () => {
  // 监听智能体列表更新
  window.electron?.ipcRenderer?.on('agent:agents-updated', (_event, data) => {
    console.log('Agents updated:', data)
    agents.value = data.agents
  })

  // 监听智能体安装事件
  window.electron?.ipcRenderer?.on('agent:agent-installed', (_event, data) => {
    console.log('Agent installed:', data)
    const agentIndex = agents.value.findIndex(a => a.id === data.agentId)
    if (agentIndex !== -1) {
      agents.value[agentIndex].installed = true
    }
  })

  // 监听智能体卸载事件
  window.electron?.ipcRenderer?.on('agent:agent-uninstalled', (_event, data) => {
    console.log('Agent uninstalled:', data)
    const agentIndex = agents.value.findIndex(a => a.id === data.agentId)
    if (agentIndex !== -1) {
      agents.value[agentIndex].installed = false
    }
  })
}

// 生命周期管理
onMounted(async () => {
  console.log('Agents.vue 组件已挂载')
  // 加载智能体数据
  await loadAgents()
  // 设置事件监听器
  setupEventListeners()
})

// 处理智能体导入完成
const handleAgentImported = async () => {
  // 重新加载智能体列表
  await loadAgents()
}

// 处理智能体创建完成
const handleAgentCreated = async () => {
  // 重新加载智能体列表
  await loadAgents()
}

onBeforeUnmount(() => {
  console.log('Agents.vue 组件即将卸载')
  // 清理事件监听器
  window.electron?.ipcRenderer?.removeAllListeners('agent:agents-updated')
  window.electron?.ipcRenderer?.removeAllListeners('agent:agent-installed')
  window.electron?.ipcRenderer?.removeAllListeners('agent:agent-uninstalled')
})
</script>

<style scoped>
/* 自定义样式可以根据需要添加 */
.agents-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

/* 自定义滚动条样式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.3);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.5);
}
</style>