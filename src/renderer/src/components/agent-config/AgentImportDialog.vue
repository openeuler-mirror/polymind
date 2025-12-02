<template>
  <Dialog :open="showDialog" @update:open="$emit('update:showDialog', $event)">
    <DialogContent class="max-w-2xl bg-card border-border overflow-hidden">
      <DialogHeader>
        <DialogTitle class="text-foreground">{{ t('agents.import.dialog.title') }}</DialogTitle>
        <DialogDescription class="text-muted-foreground">
          {{ t('agents.import.dialog.description') }}
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-5 py-4 max-h-[70vh] overflow-y-auto pr-1">
        <div class="rounded-2xl border border-border/80 bg-background/70 p-5 shadow-sm space-y-4">
          <div class="flex items-start gap-3">
            <div
              class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              1
            </div>
            <div class="space-y-1">
              <div class="text-sm font-semibold text-foreground">
                {{ t('agents.import.dialog.a2aStepParseTitle') }}
              </div>
              <p class="text-xs text-muted-foreground leading-relaxed">
                {{ t('agents.import.dialog.a2aStepParseDescription') }}
              </p>
            </div>
          </div>
          <div class="space-y-3">
            <div class="space-y-2">
              <Label for="import-url" class="text-foreground">{{ t('agents.import.dialog.urlLabel') }}</Label>
              <Input
                id="import-url"
                v-model="importUrl"
                :placeholder="t('agents.import.dialog.a2aAgentCardPlaceholder')"
                class="w-full border border-border bg-background text-foreground"
                @keyup.enter="canImport && handleImport()"
              />
            </div>
            <Button
              type="button"
              class="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              :disabled="isParsingA2AServer || !importUrl.trim()"
              @click="parseA2AAgentCard"
            >
              <Icon
                :icon="isParsingA2AServer ? 'lucide:loader-2' : 'lucide:scan'"
                class="mr-2 h-4 w-4"
                :class="{ 'animate-spin': isParsingA2AServer }"
              />
              {{
                isParsingA2AServer
                  ? t('agents.import.dialog.a2aParsingLabel')
                  : t('agents.import.dialog.a2aParseButton')
              }}
            </Button>
          </div>
        </div>

        <div class="rounded-2xl border border-border/80 bg-background/70 p-5 shadow-sm space-y-4">
          <div class="flex items-start gap-3">
            <div
              class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
            >
              2
            </div>
            <div class="space-y-1">
              <div class="text-sm font-semibold text-foreground">
                {{ t('agents.import.dialog.a2aStepConfigureTitle') }}
              </div>
              <p class="text-xs text-muted-foreground leading-relaxed">
                {{ t('agents.import.dialog.a2aStepConfigureDescription') }}
              </p>
            </div>
          </div>

          <div
            v-if="a2aPreview"
            class="space-y-5 rounded-2xl border border-border/70 bg-card/90 p-5"
          >
            <div class="text-sm font-semibold text-foreground">
              {{ t('agents.import.dialog.a2aBasicInfoTitle') }}
            </div>
            <div class="space-y-4 text-sm">
              <div class="space-y-1">
                <div class="font-medium text-foreground">
                  {{ t('agents.import.dialog.a2aAgentNameLabel') }}
                </div>
                <p class="leading-relaxed text-muted-foreground">
                  {{ a2aPreview.name }}
                </p>
              </div>
              <div class="space-y-1">
                <div class="font-medium text-foreground">
                  {{ t('agents.import.dialog.a2aAgentDescriptionLabel') }}
                </div>
                <p class="leading-relaxed text-muted-foreground">
                  {{ a2aPreview.description || '--' }}
                </p>
              </div>
              <div class="space-y-1">
                <div class="font-medium text-foreground">
                  {{ t('agents.import.dialog.a2aEndpointLabel') }}
                </div>
                <p class="leading-relaxed text-muted-foreground break-all">
                  {{ a2aPreview.url }}
                </p>
              </div>
              <div class="space-y-1">
                <div class="font-medium text-foreground">
                  {{ t('agents.import.dialog.a2aExpandableLabel') }}
                </div>
                <p class="leading-relaxed text-muted-foreground">
                  {{ (a2aPreview.skills?.length || 0) > 0 ? t('agents.import.dialog.a2aYes') : t('agents.import.dialog.a2aNo') }}
                </p>
              </div>
              <div class="space-y-1">
                <div class="font-medium text-foreground">
                  {{ t('agents.import.dialog.a2aStreamingLabel') }}
                </div>
                <p class="leading-relaxed text-muted-foreground">
                  {{ a2aPreview.streamingSupported ? t('agents.import.dialog.a2aYes') : t('agents.import.dialog.a2aNo') }}
                </p>
              </div>
            </div>

            <div class="text-sm font-semibold text-foreground">
              {{ t('agents.import.dialog.a2aSkillsLabel') }}
            </div>
            <div
              v-if="a2aPreview.skills?.length"
              class="space-y-3"
            >
              <div
                v-for="skill in a2aPreview.skills"
                :key="skill.name"
                class="rounded-xl border border-border/60 bg-card/80"
              >
                <button
                  type="button"
                  class="flex w-full items-center justify-between gap-3 px-4 py-3"
                  @click="toggleSkillExpanded(skill.name)"
                >
                  <div class="leading-relaxed text-muted-foreground">
                    {{ skill.name }}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-100">
                      {{ t('agents.import.dialog.a2aSkillAvailable') }}
                    </span>
                    <Icon
                      icon="lucide:chevron-down"
                      class="h-4 w-4 text-muted-foreground transition-transform"
                      :class="isSkillExpanded(skill.name) ? 'rotate-180' : ''"
                    />
                  </div>
                </button>
                <div
                  v-if="isSkillExpanded(skill.name)"
                  class="border-t border-border/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground"
                >
                  {{ skill.description || t('agents.import.dialog.a2aSkillNoDescription') }}
                </div>
              </div>
            </div>
            <div
              v-else
              class="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center text-xs text-muted-foreground"
            >
              {{ t('agents.import.dialog.a2aSkillsEmpty') }}
            </div>
          </div>

          <div
            v-else
            class="mt-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 p-8 text-center text-xs text-muted-foreground"
          >
            <Icon icon="lucide:box" class="mb-3 h-10 w-10 text-muted-foreground/60" />
            <div class="text-sm font-semibold text-muted-foreground">
              {{ t('agents.import.dialog.a2aPreviewEmpty') }}
            </div>
            <p class="mt-1 max-w-xs text-muted-foreground/80">
              {{ t('agents.import.dialog.a2aPreviewEmptyDescription') }}
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          @click="handleCancel"
          :disabled="isImporting"
          class="border-border text-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {{ t('agents.import.dialog.cancel') }}
        </Button>
        <Button
          @click="handleImport"
          :disabled="!canImport"
          class="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Icon v-if="isImporting" icon="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" />
          {{ isImporting ? t('agents.import.dialog.importing') : t('agents.import.dialog.import') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@/components/ui/toast/use-toast'
import { usePresenter } from '@/composables/usePresenter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import type { AgentCardData } from '@shared/presenter'

const { toast } = useToast()
const { t } = useI18n()

interface Props {
  showDialog: boolean
}

interface Emits {
  (e: 'update:showDialog', value: boolean): void
  (e: 'imported'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const importUrl = ref('')
const isImporting = ref(false)
const isParsingA2AServer = ref(false)
const a2aPreview = ref<AgentCardData | null>(null)
const expandedSkillMap = ref<Record<string, boolean>>({})
const a2aServerPresenter = usePresenter('a2aPresenter')
const canImport = computed(() => {
  const hasUrl = importUrl.value.trim().length > 0
  return Boolean(a2aPreview.value) && hasUrl && !isImporting.value && !isParsingA2AServer.value
})

const AGENT_CARD_SUFFIX = '/.well-known/agent-card.json'

const normalizeA2AServerUrls = (input: string) => {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error(t('agents.import.error.invalidUrl'))
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(t('agents.import.error.invalidUrlFormat'))
  }

  let baseUrl = parsed.toString().replace(/\/+$/, '')
  if (baseUrl.endsWith(AGENT_CARD_SUFFIX)) {
    baseUrl = baseUrl.slice(0, -AGENT_CARD_SUFFIX.length)
  }
  const cardUrl = `${baseUrl}${AGENT_CARD_SUFFIX}`
  return { baseUrl, cardUrl }
}

const clearA2APreview = async () => {
  const pendingPreview = a2aPreview.value
  a2aPreview.value = null
  expandedSkillMap.value = {}
  if (!pendingPreview) return
}

const isSkillExpanded = (name: string) => {
  return !!expandedSkillMap.value[name]
}

const toggleSkillExpanded = (name: string) => {
  expandedSkillMap.value = {
    ...expandedSkillMap.value,
    [name]: !expandedSkillMap.value[name]
  }
}

const parseA2AAgentCard = async () => {
  try {
    const { baseUrl, cardUrl } = normalizeA2AServerUrls(importUrl.value)
    isParsingA2AServer.value = true
    await clearA2APreview()

    const agentCardData = await a2aServerPresenter.fetchAgentCard(baseUrl)
   
    if (agentCardData && (agentCardData as any).errorCode) {
      const msg = (agentCardData as any).errorMsg || "Failed to fetch agent card"
      throw new Error(msg)
    }

    importUrl.value = cardUrl
    // Narrow the union type: we've already handled the error shape above,
    // so it's safe to treat the result as AgentCardData for runtime and typing.
    const card = agentCardData as AgentCardData
    a2aPreview.value = card
    expandedSkillMap.value = {}
    toast({
      title: t('agents.import.dialog.a2aParseSuccess'),
      description: card.name,
      duration: 600
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast({
      title: t('agents.import.dialog.a2aParseFailed'),
      description: message,
      variant: 'destructive',
      duration: 1000
    })
  } finally {
    isParsingA2AServer.value = false
  }
}

const resetDialogState = () => {
  importUrl.value = ''
  isImporting.value = false
  isParsingA2AServer.value = false
  expandedSkillMap.value = {}
  void clearA2APreview()
}

// 监听对话框显示状态变化，重置表单
watch(() => props.showDialog, (newVal) => {
  if (!newVal) {
    resetDialogState()
  }
})

// 导入智能体
const handleImport = async () => {
  if (isParsingA2AServer.value || !a2aPreview.value) {
    return
  }
  const { baseUrl } = normalizeA2AServerUrls(importUrl.value)
  isImporting.value = true

  try {
    // 调用后端导入方法获取agent数据
    const agentCardData = await a2aServerPresenter.addA2AServer(baseUrl)
    if (agentCardData && (agentCardData as any).errorCode) {
      const msg = (agentCardData as any).errorMsg || "Failed to import agent"
      throw new Error(msg)
    }

    await clearA2APreview()
    
    // 显示成功消息
    toast({
      title: t('agents.import.success.title'),
      description: t('agents.import.success.description', { name: (agentCardData as AgentCardData).name }),
      variant: 'default',
      duration: 3000
    })
    
    // 关闭对话框并重置状态
    emit('update:showDialog', false)
    emit('imported')
  } catch (error) {
    console.error('Failed to import agent:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    
    toast({
      title: t('agents.import.error.title'),
      description: t('agents.import.error.failed', { error: errorMessage }),
      variant: 'destructive',
      duration: 5000
    })
  } finally {
    isImporting.value = false
  }
}

// 取消导入
const handleCancel = () => {
  emit('update:showDialog', false)
}
</script>
