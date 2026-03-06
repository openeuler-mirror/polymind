<template>
  <div class="w-full h-full flex flex-row">
    <ScrollArea class="w-64 border-r h-full px-2">
      <div class="space-y-4">
        <!-- 搜索框 -->
        <div class="p-2 sticky top-0 z-10 bg-container">
          <div class="relative">
            <Input
              v-model="searchQueryBase"
              :placeholder="t('settings.im.search')"
              class="h-8 pr-8"
              @keydown.esc="clearSearch"
            />
            <!-- 搜索图标：在无内容时显示 -->
            <Icon
              v-if="!showClearButton"
              icon="lucide:search"
              class="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            />
            <!-- 清除按钮：在有内容时显示 -->
            <Icon
              v-else
              icon="lucide:x"
              class="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground"
              @click="clearSearch"
            />
          </div>
        </div>
        <!-- 启用的IM服务商区域 -->
        <div v-if="enabledProviders.length > 0">
          <div class="text-xs font-medium text-muted-foreground mb-2 px-2">
            {{ t('settings.im.enabled') }} ({{ enabledProviders.length }})
          </div>
          <draggable
            v-model="enabledProviders"
            item-key="id"
            handle=".drag-handle"
            class="space-y-2"
            group="imProviders"
            :move="onMoveEnabled"
            @end="handleDragEnd"
          >
            <template #item="{ element: provider }">
              <div
                :data-provider-id="provider.id"
                :class="[
                  'flex flex-row hover:bg-accent items-center gap-2 rounded-lg p-2 cursor-pointer group',
                  route.params?.providerId === provider.id
                    ? 'bg-secondary text-secondary-foreground'
                    : ''
                ]"
                @click="setActiveProvider(provider.id)"
              >
                <Icon
                  icon="lucide:grip-vertical"
                  class="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-move drag-handle"
                />
                <ImIcon :provider-type="provider.type" :custom-class="'w-4 h-4 text-muted-foreground'" :is-dark="themeStore.isDark" />
                <span class="text-sm font-medium flex-1" :dir="languageStore.dir">{{
                  provider.name
                }}</span>
                <Switch :checked="provider.enabled" @click.stop="toggleProviderStatus(provider)" />
              </div>
            </template>
          </draggable>
        </div>

        <!-- 禁用的IM服务商区域 -->
        <div v-if="disabledProviders.length > 0">
          <div class="text-xs font-medium text-muted-foreground mb-2 px-2">
            {{ t('settings.im.disabled') }} ({{ disabledProviders.length }})
          </div>
          <draggable
            v-model="disabledProviders"
            item-key="id"
            handle=".drag-handle"
            class="space-y-2"
            group="imProviders"
            :move="onMoveDisabled"
            @end="handleDragEnd"
          >
            <template #item="{ element: provider }">
              <div
                :data-provider-id="provider.id"
                :class="[
                  'flex flex-row hover:bg-accent items-center gap-2 rounded-lg p-2 cursor-pointer group opacity-60',
                  route.params?.providerId === provider.id
                    ? 'bg-secondary text-secondary-foreground'
                    : ''
                ]"
                @click="setActiveProvider(provider.id)"
              >
                <Icon
                  icon="lucide:grip-vertical"
                  class="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-move drag-handle"
                />
                <ImIcon :provider-type="provider.type" :custom-class="'w-4 h-4 text-muted-foreground'" :is-dark="themeStore.isDark" />
                <span class="text-sm font-medium flex-1" :dir="languageStore.dir">{{
                  provider.name
                }}</span>
                <Switch :checked="provider.enabled" @click.stop="toggleProviderStatus(provider)" />
              </div>
            </template>
          </draggable>
        </div>

        <div class="sticky bottom-0 z-10 p-2 bg-container" :dir="languageStore.dir">
          <button
            class="w-full flex flex-row items-center gap-2 rounded-lg p-2 bg-container cursor-pointer hover:bg-accent"
            @click="openAddProviderDialog"
          >
            <Icon icon="lucide:plus" class="w-4 h-4 text-muted-foreground" />
            <span class="text-sm font-medium">{{ t('settings.im.addImProvider') }}</span>
          </button>
        </div>
      </div>
    </ScrollArea>
    
    <!-- 右侧配置区域 -->
    <template v-if="activeProvider">
      <div class="flex-1 p-4 overflow-y-auto">
        <div class="space-y-6">
          <!-- 提供商基本信息 -->
          <div class="space-y-4">
            <h3 class="text-lg font-medium">{{ activeProvider.name }}</h3>
            <div class="flex items-center gap-2">
              <ImIcon :provider-type="activeProvider.type" :custom-class="'w-5 h-5'" :is-dark="themeStore.isDark" />
              <span class="text-sm text-muted-foreground">{{ imStore.getProviderTypeName(activeProvider.type) }}</span>
            </div>
          </div>

          <!-- 配置表单 -->
          <div class="space-y-6">
            <!-- 基本配置 -->
            <div class="space-y-4">
              <h4 class="text-sm font-medium">{{ t('settings.im.basicConfig') }}</h4>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div v-for="(param, key) in activeProvider.config" :key="key" class="space-y-2">
                  <label class="text-xs font-medium">{{ param.label || key }}</label>
                  <Input
                    v-model="activeProvider.config[key].value"
                    :type="param.type || 'text'"
                    :placeholder="param.placeholder || ''"
                    @change="saveProviderConfig"
                  />
                  <p v-if="param.description" class="text-xs text-muted-foreground">
                    {{ param.description }}
                  </p>
                </div>
              </div>
            </div>

            <!-- 高级配置 -->
            <div class="space-y-4">
              <h4 class="text-sm font-medium">{{ t('settings.im.advancedConfig') }}</h4>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <label class="text-sm font-medium">{{ t('settings.im.enableNotifications') }}</label>
                    <p class="text-xs text-muted-foreground">{{ t('settings.im.enableNotificationsDesc') }}</p>
                  </div>
                  <Switch v-model="activeProvider.notificationsEnabled" @update:checked="saveProviderConfig" />
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <label class="text-sm font-medium">{{ t('settings.im.enableAutoReply') }}</label>
                    <p class="text-xs text-muted-foreground">{{ t('settings.im.enableAutoReplyDesc') }}</p>
                  </div>
                  <Switch v-model="activeProvider.autoReplyEnabled" @update:checked="saveProviderConfig" />
                </div>
              </div>
            </div>

            <!-- 测试区域 -->
            <div class="space-y-4 pt-4 border-t">
              <h4 class="text-sm font-medium">{{ t('settings.im.testConnection') }}</h4>
              <div class="flex items-center gap-3">
                <Button
                  variant="outline"
                  @click="testConnection"
                  :disabled="testingConnection"
                >
                  <Icon
                    :icon="testingConnection ? 'lucide:loader-2' : 'lucide:plug'"
                    :class="['w-4 h-4 mr-2', testingConnection && 'animate-spin']"
                  />
                  {{ testingConnection ? t('settings.im.testing') : t('settings.im.testConnection') }}
                </Button>
                <Button
                  variant="outline"
                  @click="sendTestMessage"
                  :disabled="sendingTestMessage"
                >
                  <Icon
                    :icon="sendingTestMessage ? 'lucide:loader-2' : 'lucide:send'"
                    :class="['w-4 h-4 mr-2', sendingTestMessage && 'animate-spin']"
                  />
                  {{ sendingTestMessage ? t('settings.im.sending') : t('settings.im.sendTestMessage') }}
                </Button>
              </div>
            </div>

            <!-- 保存按钮 -->
            <div class="pt-4 border-t">
              <Button @click="saveProviderConfig" class="w-full">
                <Icon icon="lucide:save" class="w-4 h-4 mr-2" />
                {{ t('common.save') }}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="flex-1 flex items-center justify-center text-muted-foreground">
      <div class="text-center">
        <Icon icon="lucide:message-square" class="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>{{ t('settings.im.selectProvider') }}</p>
      </div>
    </div>
  </div>

  <!-- 添加IM提供商对话框 -->
  <Dialog v-model:open="isAddProviderDialogOpen">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t('settings.im.addImProvider') }}</DialogTitle>
        <DialogDescription>
          {{ t('settings.im.addImProviderDesc') }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <!-- 提供商类型选择 -->
        <div class="space-y-2">
          <label class="text-sm font-medium">{{ t('settings.im.providerType') }}</label>
          <Select v-model="newProvider.type">
            <SelectTrigger>
              <SelectValue :placeholder="t('settings.im.selectProviderType')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="qq">
                <div class="flex items-center gap-2">
                  <ImIcon provider-type="qq" :custom-class="'w-4 h-4'" :is-dark="themeStore.isDark" />
                  <span>QQ</span>
                </div>
              </SelectItem>
              <SelectItem value="custom">
                <div class="flex items-center gap-2">
                  <ImIcon provider-type="custom" :custom-class="'w-4 h-4'" :is-dark="themeStore.isDark" />
                  <span>{{ t('settings.im.customProvider') }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 提供商名称 -->
        <div class="space-y-2">
          <label class="text-sm font-medium">{{ t('settings.im.providerName') }}</label>
          <Input
            v-model="newProvider.name"
            :placeholder="t('settings.im.providerNamePlaceholder')"
          />
        </div>

        <!-- 初始配置 -->
        <div v-if="newProvider.type" class="space-y-3">
          <div class="text-xs text-muted-foreground">
            {{ t('settings.im.initialConfigHint') }}
          </div>
          <div v-for="(param, key) in imStore.getDefaultConfigForType(newProvider.type)" :key="key" class="space-y-1">
            <label class="text-xs font-medium">{{ param.label || key }}</label>
            <Input
              v-model="newProvider.config[key]"
              :type="param.type || 'text'"
              :placeholder="param.placeholder || ''"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="closeAddProviderDialog">
          {{ t('common.cancel') }}
        </Button>
        <Button @click="addImProvider" :disabled="!isValidNewProvider">
          {{ t('common.add') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { computed, ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { refDebounced } from '@vueuse/core'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Icon } from '@iconify/vue'
import ImIcon from '@/components/icons/ImIcon.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLanguageStore } from '@/stores/language'
import { useThemeStore } from '@/stores/theme'
import { useToast } from '@/components/ui/toast'
import draggable from 'vuedraggable'
import { useImStore, type ImProvider, type ImProviderConfigParam } from '@/stores/im'

const { t } = useI18n()
const route = useRoute()
const languageStore = useLanguageStore()
const themeStore = useThemeStore()
const { toast } = useToast()
const imStore = useImStore()

const searchQueryBase = ref('')
const searchQuery = refDebounced(searchQueryBase, 150)
const showClearButton = computed(() => searchQueryBase.value.trim().length > 0)
const activeProviderId = ref<string | null>(null)
const testingConnection = ref(false)
const sendingTestMessage = ref(false)

// 添加IM提供商对话框相关
const isAddProviderDialogOpen = ref(false)
const newProvider = ref({
  type: 'qq' as ImProvider['type'],
  name: '',
  config: {} as Record<string, string>
})

// 计算属性
const filterProviders = (providers: ImProvider[]) => {
  if (!searchQuery.value.trim()) {
    return providers
  }
  const query = searchQuery.value.toLowerCase().trim()
  return providers.filter(
    (provider) =>
      provider.name.toLowerCase().includes(query) ||
      provider.type.toLowerCase().includes(query)
  )
}

const allEnabledProviders = computed(() => imStore.sortedProviders.filter((p) => p.enabled))
const allDisabledProviders = computed(() => imStore.sortedProviders.filter((p) => !p.enabled))

const enabledProviders = computed({
  get: () => filterProviders(allEnabledProviders.value),
  set: (newProviders) => {
    imStore.updateProvidersOrder(newProviders)
  }
})

const disabledProviders = computed({
  get: () => filterProviders(allDisabledProviders.value),
  set: (newProviders) => {
    imStore.updateProvidersOrder(newProviders)
  }
})

const activeProvider = computed(() => {
  if (!activeProviderId.value) return null
  return imStore.providers.find((p) => p.id === activeProviderId.value)
})

// 函数实现
const clearSearch = () => {
  searchQueryBase.value = ''
}

const setActiveProvider = (providerId: string) => {
  activeProviderId.value = providerId
  // 在实际应用中，这里应该更新路由
  // router.push({ name: 'settings-im', params: { providerId } })
}

const toggleProviderStatus = async (provider: ImProvider) => {
  await imStore.updateProviderStatus(provider.id, !provider.enabled)
}

const openAddProviderDialog = () => {
  isAddProviderDialogOpen.value = true
  newProvider.value = {
    type: 'qq',
    name: '',
    config: {}
  }
}

const closeAddProviderDialog = () => {
  isAddProviderDialogOpen.value = false
}

const isValidNewProvider = computed(() => {
  return newProvider.value.name.trim().length > 0
})

const addImProvider = async () => {
  if (!isValidNewProvider.value) return

  const defaultConfig = imStore.getDefaultConfigForType(newProvider.value.type)
  const configWithValues: Record<string, ImProviderConfigParam> = {}
  
  Object.entries(defaultConfig).forEach(([key, param]) => {
    configWithValues[key] = {
      value: newProvider.value.config[key] || '',
      label: param.label || key,
      type: param.type || 'text',
      placeholder: param.placeholder || '',
      description: param.description || ''
    }
  })

  const newImProvider = await imStore.addProvider({
    name: newProvider.value.name.trim(),
    type: newProvider.value.type,
    enabled: true,
    icon: imStore.defaultIconMap[newProvider.value.type] || 'lucide:settings',
    config: configWithValues,
    notificationsEnabled: true,
    autoReplyEnabled: false
  })

  setActiveProvider(newImProvider.id)
  closeAddProviderDialog()
  
  toast({
    title: t('common.success'),
    description: t('settings.im.providerAdded'),
    variant: 'default'
  })
}

const saveProviderConfig = async () => {
  if (!activeProvider.value) return
  
  await imStore.updateProvider(activeProvider.value.id, activeProvider.value)
  toast({
    title: t('common.success'),
    description: t('common.saved'),
    variant: 'default'
  })
}

const testConnection = async () => {
  if (!activeProvider.value) return
  
  testingConnection.value = true
  try {
    const success = await imStore.testConnection(activeProvider.value.id)
    if (success) {
      toast({
        title: t('common.success'),
        description: t('settings.im.connectionTestSuccess'),
        variant: 'default'
      })
    } else {
      toast({
        title: t('common.error'),
        description: t('settings.im.connectionTestFailed'),
        variant: 'destructive'
      })
    }
  } catch (error) {
    toast({
      title: t('common.error'),
      description: t('settings.im.connectionTestFailed'),
      variant: 'destructive'
    })
  } finally {
    testingConnection.value = false
  }
}

const sendTestMessage = async () => {
  if (!activeProvider.value) return
  
  sendingTestMessage.value = true
  try {
    const success = await imStore.sendTestMessage(activeProvider.value.id)
    if (success) {
      toast({
        title: t('common.success'),
        description: t('settings.im.testMessageSent'),
        variant: 'default'
      })
    } else {
      toast({
        title: t('common.error'),
        description: t('settings.im.testMessageFailed'),
        variant: 'destructive'
      })
    }
  } catch (error) {
    toast({
      title: t('common.error'),
      description: t('settings.im.testMessageFailed'),
      variant: 'destructive'
    })
  } finally {
    sendingTestMessage.value = false
  }
}

// 处理拖拽结束事件
const handleDragEnd = () => {
  // 可以在这里添加额外的处理逻辑
}

// 处理启用区域的拖拽移动事件
const onMoveEnabled = (evt: any) => {
  const draggedProvider = evt.draggedContext.element
  const relatedProvider = evt.relatedContext?.element
  if (!draggedProvider || !draggedProvider.enabled) {
    return false
  }
  if (relatedProvider && !relatedProvider.enabled) {
    return false
  }
  return true
}

// 处理禁用区域的拖拽移动事件
const onMoveDisabled = (evt: any) => {
  const draggedProvider = evt.draggedContext.element
  const relatedProvider = evt.relatedContext?.element
  if (!draggedProvider || draggedProvider.enabled) {
    return false
  }
  if (relatedProvider && relatedProvider.enabled) {
    return false
  }
  return true
}

onMounted(() => {
  // 如果有路由参数，设置活动提供商
  if (route.params.providerId) {
    activeProviderId.value = route.params.providerId as string
  }
})
</script>

<style scoped>
.drag-handle {
  touch-action: none;
}
</style>