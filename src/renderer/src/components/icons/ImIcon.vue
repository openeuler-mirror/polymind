<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import qqIcon from '@/assets/im-icons/tencent-qq.svg?url'

// 导入所有 IM 图标
const icons = {
  qq: qqIcon,
  custom: 'lucide:settings'
} as const

type ProviderType = keyof typeof icons

interface ImIconProps {
  providerType: ProviderType | string
  customClass?: string
  isDark?: boolean
}

const props = withDefaults(defineProps<ImIconProps>(), {
  customClass: 'w-4 h-4',
  isDark: false
})

const iconKey = computed(() => {
  return icons[props.providerType as ProviderType] || icons.custom
})

const isSvgIcon = computed(() => {
  return typeof iconKey.value === 'string' && !iconKey.value.startsWith('lucide:')
})

const invert = computed(() => {
  if (!props.isDark) {
    return false
  }
  if (
    props.providerType === 'qq'
  ) {
    return true
  }
  return false
})
</script>

<template>
  <template v-if="isSvgIcon">
    <img 
      :src="iconKey" 
      :alt="providerType" 
      :class="[customClass, { invert }, invert ? 'opacity-50' : '']" 
    />
  </template>
  <Icon v-else :icon="iconKey" :class="customClass" />
</template>

<style scoped>
.invert {
  filter: invert(1);
}
</style>
