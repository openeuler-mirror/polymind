import { defineStore } from 'pinia'
import { ref, onMounted, computed } from 'vue'
import { usePresenter } from '@/composables/usePresenter'
import { nanoid } from 'nanoid'
import { CONFIG_EVENTS } from '@/events'

export interface ImProviderConfigParam {
  value: string
  label?: string
  type?: string
  placeholder?: string
  description?: string
}

export interface ImProvider {
  id: string
  name: string
  type: 'qq' | 'custom'
  enabled: boolean
  icon: string
  config: Record<string, ImProviderConfigParam>
  notificationsEnabled: boolean
  autoReplyEnabled: boolean
}

export const useImStore = defineStore('im', () => {
  const configP = usePresenter('configPresenter')

  const providers = ref<ImProvider[]>([])
  const providerOrder = ref<string[]>([])
  const defaultProviders = ref<ImProvider[]>([])

  // 默认 IM 服务商配置
  const defaultImProviders: ImProvider[] = [
    {
      id: 'qq-demo',
      name: 'QQ',
      type: 'qq',
      enabled: true,
      icon: '/src/assets/im-icons/tencent-qq.svg',
      config: {
        botId: {
          value: '',
          label: 'Bot ID',
          placeholder: '输入QQ机器人ID',
          description: 'QQ机器人的ID'
        },
        token: {
          value: '',
          label: 'Token',
          type: 'password',
          placeholder: '输入QQ机器人Token',
          description: 'QQ机器人的Token'
        }
      },
      notificationsEnabled: true,
      autoReplyEnabled: false
    }
  ]

  // 默认图标映射
  const defaultIconMap: Record<ImProvider['type'], string> = {
    qq: '/src/assets/im-icons/tencent-qq.svg',
    custom: 'lucide:settings'
  }

  // 默认配置映射
  const getDefaultConfigForType = (type: ImProvider['type']): Record<string, any> => {
    const configs: Record<ImProvider['type'], Record<string, any>> = {
      qq: {
        botId: {
          label: 'Bot ID',
          placeholder: '输入QQ机器人ID',
          type: 'text'
        },
        token: {
          label: 'Token',
          placeholder: '输入QQ机器人Token',
          type: 'password'
        }
      },
      custom: {
        endpoint: {
          label: 'API端点',
          placeholder: 'https://api.example.com/webhook',
          type: 'url'
        },
        authToken: {
          label: '认证Token',
          placeholder: '输入认证Token',
          type: 'password'
        }
      }
    }
    return configs[type] || {}
  }

  // 加载保存的提供商顺序
  const loadSavedOrder = async () => {
    try {
      const savedOrder = await configP.getSetting<string[]>('imProviderOrder')
      if (savedOrder && Array.isArray(savedOrder)) {
        providerOrder.value = savedOrder
      }
    } catch (error) {
      console.error('Failed to load IM provider order:', error)
    }
  }

  // 保存提供商顺序
  const saveProviderOrder = async (order: string[]) => {
    try {
      await configP.setSetting('imProviderOrder', order)
      providerOrder.value = order
    } catch (error) {
      console.error('Failed to save IM provider order:', error)
    }
  }

  // 计算排序后的提供商
  const sortedProviders = computed(() => {
    const enabledProviders: ImProvider[] = []
    const disabledProviders: ImProvider[] = []

    providers.value.forEach((provider) => {
      if (provider.enabled) {
        enabledProviders.push(provider)
      } else {
        disabledProviders.push(provider)
      }
    })

    // 排序函数：使用保存的顺序
    const sortProviders = (providerList: ImProvider[]) => {
      return providerList.sort((a, b) => {
        const aOrderIndex = providerOrder.value.indexOf(a.id)
        const bOrderIndex = providerOrder.value.indexOf(b.id)
        if (aOrderIndex !== -1 && bOrderIndex !== -1) {
          return aOrderIndex - bOrderIndex
        }
        if (aOrderIndex !== -1 && bOrderIndex === -1) {
          return -1
        }
        if (aOrderIndex === -1 && bOrderIndex !== -1) {
          return 1
        }
        return 0
      })
    }

    const sortedEnabled = sortProviders(enabledProviders)
    const sortedDisabled = sortProviders(disabledProviders)

    return [...sortedEnabled, ...sortedDisabled]
  })

  // 初始化 IM 提供商
  const initImProviders = async () => {
    try {
      // 尝试从配置中加载提供商
      const savedProviders = await configP.getSetting<ImProvider[]>('imProviders')

      if (savedProviders && Array.isArray(savedProviders) && savedProviders.length > 0) {
        providers.value = savedProviders
      } else {
        // 使用默认提供商
        providers.value = defaultImProviders
        await configP.setSetting('imProviders', defaultImProviders)
      }

      // 保存默认提供商
      defaultProviders.value = defaultImProviders

      // 加载保存的顺序
      await loadSavedOrder()

      // 设置事件监听
      setupImProviderListener()
    } catch (error) {
      console.error('Failed to initialize IM providers:', error)
      // 出错时使用默认提供商
      providers.value = defaultImProviders
      defaultProviders.value = defaultImProviders
    }
  }

  // 更新提供商
  const updateProvider = async (id: string, provider: ImProvider) => {
    try {
      const index = providers.value.findIndex((p) => p.id === id)
      if (index !== -1) {
        providers.value[index] = provider
        await configP.setSetting('imProviders', providers.value)
      }
    } catch (error) {
      console.error('Failed to update IM provider:', error)
    }
  }

  // 更新提供商状态
  const updateProviderStatus = async (id: string, enabled: boolean) => {
    try {
      const provider = providers.value.find((p) => p.id === id)
      if (provider) {
        provider.enabled = enabled
        await configP.setSetting('imProviders', providers.value)
      }
    } catch (error) {
      console.error('Failed to update IM provider status:', error)
    }
  }

  // 添加新的提供商
  const addProvider = async (provider: Omit<ImProvider, 'id'>) => {
    try {
      const newProvider: ImProvider = {
        ...provider,
        id: nanoid()
      }

      providers.value.push(newProvider)
      await configP.setSetting('imProviders', providers.value)

      return newProvider
    } catch (error) {
      console.error('Failed to add IM provider:', error)
      throw error
    }
  }

  // 删除提供商
  const removeProvider = async (id: string) => {
    try {
      providers.value = providers.value.filter((p) => p.id !== id)
      providerOrder.value = providerOrder.value.filter((providerId) => providerId !== id)

      await configP.setSetting('imProviders', providers.value)
      await saveProviderOrder(providerOrder.value)
    } catch (error) {
      console.error('Failed to remove IM provider:', error)
    }
  }

  // 更新提供商顺序
  const updateProvidersOrder = async (newOrder: ImProvider[]) => {
    try {
      const order = newOrder.map((provider) => provider.id)
      await saveProviderOrder(order)
    } catch (error) {
      console.error('Failed to update IM providers order:', error)
    }
  }

  // 测试连接
  const testConnection = async (providerId: string) => {
    try {
      // 模拟测试连接
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.info(`Test connection successful for provider ID: ${providerId}`)
      return true
    } catch (error) {
      console.error('Failed to test providerId IM connection:', error)
      return false
    }
  }

  // 发送测试消息
  const sendTestMessage = async (providerId: string) => {
    try {
      // 模拟发送测试消息
      await new Promise((resolve) => setTimeout(resolve, 1000))
      console.info(`Test message sent successfully for provider ID: ${providerId}`)
      return true
    } catch (error) {
      console.error('Failed to send test message:', error)
      return false
    }
  }

  // 获取提供商图标
  const getProviderIcon = (provider: ImProvider): string => {
    if (provider.icon) {
      return provider.icon
    }
    return defaultIconMap[provider.type] || 'lucide:message-square'
  }

  // 获取提供商类型名称
  const getProviderTypeName = (type: ImProvider['type']): string => {
    const nameMap: Record<ImProvider['type'], string> = {
      qq: 'QQ',
      custom: '自定义'
    }
    return nameMap[type] || '未知'
  }

  // 设置 IM 提供商事件监听器
  const setupImProviderListener = () => {
    // 监听配置变更事件
    window.electron.ipcRenderer.on(CONFIG_EVENTS.IM_PROVIDER_CHANGED, async () => {
      console.log('IM Provider changed - updating providers and order')
      const savedProviders = await configP.getSetting<ImProvider[]>('imProviders')
      if (savedProviders && Array.isArray(savedProviders)) {
        providers.value = savedProviders
      }
      await loadSavedOrder()
    })
  }

  // 在 store 创建时初始化
  onMounted(async () => {
    await initImProviders()
  })

  return {
    providers,
    sortedProviders,
    defaultProviders,
    updateProvider,
    updateProviderStatus,
    addProvider,
    removeProvider,
    updateProvidersOrder,
    testConnection,
    sendTestMessage,
    getProviderIcon,
    getProviderTypeName,
    getDefaultConfigForType,
    defaultIconMap
  }
})
