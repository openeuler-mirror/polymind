<template>
  <div
    class="bg-card border border-border rounded-lg p-4 hover:shadow-md transition-shadow duration-200 cursor-pointer"
    @click="showDetails(agent)"
  >
    <!-- 头部：图标和标题 -->
    <div class="flex items-start justify-between mb-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon :icon="agent.icon" class="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 class="font-semibold text-foreground">{{ agent.name }}</h3>
          <p class="text-xs text-muted-foreground">v{{ agent.version }}</p>
        </div>
      </div>
      
      <div class="flex items-center gap-2">

        <!-- 删除按钮 -->
        <button
          class="p-1 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-colors"
          @click.stop="handleDelete"
          :title="t('agents.agentCard.delete')"
        >
          <Icon icon="lucide:trash-2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- 描述 -->
    <p class="text-sm text-muted-foreground mb-3 line-clamp-2">
      {{ agent.description }}
    </p>

    <!-- 特性标签和开关 -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex flex-wrap gap-1 flex-1">
        <Badge
          v-for="skill in agent.skills.slice(0, 3)"
          :key="skill.id"
          variant="secondary"
          class="text-xs"
        >
          {{ skill.name }}
        </Badge>
        <Badge
          v-if="agent.skills.length > 3"
          variant="outline"
          class="text-xs"
        >
          +{{ agent.skills.length - 3 }}
        </Badge>
      </div>
      
      <!-- 安装/卸载开关 -->
      <div class="flex items-center gap-2 ml-4">
        <Switch
          :checked="agent.installed"
          @update:checked="toggleInstallation"
          @click.stop
        />
      </div>
    </div>
  </div>

  <!-- Agent 配置详情对话框 -->
  <AgentSettings
    v-model:show-agent-settings="showAgentSettings"
    :selected-agent="selectedAgent"
  />

  <!-- 删除确认对话框 -->
  <AlertDialog :open="showDeleteConfirm" @update:open="showDeleteConfirm = $event">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('agents.agentCard.deleteConfirm.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('agents.agentCard.deleteConfirm.description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="showDeleteConfirm = false">
          {{ t('dialog.cancel') }}
        </AlertDialogCancel>
        <AlertDialogAction @click="confirmDelete" class="bg-destructive text-destructive-foreground hover:bg-destructive/90">
          {{ t('agents.agentCard.deleteConfirm.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentSettings from './AgentSettings.vue'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { Agent } from '@shared/presenter'

interface Props {
  agent: Agent
}

const props = defineProps<Props>()
const emit = defineEmits<{
  configure: [agent: Agent]
  install: [agent: Agent]
  uninstall: [agent: Agent]
  delete: [agent: Agent]
}>()

const { t } = useI18n()

// 对话框状态
const showAgentSettings = ref(false)
const selectedAgent = ref<Agent | null>(null)
const showDeleteConfirm = ref(false)

// 切换安装状态
const toggleInstallation = () => {
  if (props.agent.installed) {
    // 如果已安装，则卸载
    emit('uninstall', props.agent)
  } else {
    // 如果未安装，则安装
    emit('install', props.agent)
  }
}

// 显示详细信息
const showDetails = (agent: Agent) => {
  selectedAgent.value = agent
  showAgentSettings.value = true
}

// 处理删除按钮点击
const handleDelete = () => {
  showDeleteConfirm.value = true
}

// 确认删除
const confirmDelete = () => {
  emit('delete', props.agent)
  showDeleteConfirm.value = false
}
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-clamp: 2;
  overflow: hidden;
}
</style>
