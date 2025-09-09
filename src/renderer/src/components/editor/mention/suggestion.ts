import { VueRenderer } from '@tiptap/vue-3'
import tippy from 'tippy.js'
import { Ref, ref } from 'vue'

import MentionList from './MentionList.vue'
import { PromptListEntry, ResourceListEntry } from '@shared/presenter'

// Define the type for categorized data
export interface CategorizedData {
  label: string
  icon?: string
  id?: string
  type: string
  category?: string
  description?: string
  mcpEntry?: ResourceListEntry | PromptListEntry
}

// Sample categorized items
const categorizedData: CategorizedData[] = [
  { label: 'files', icon: 'lucide:files', type: 'category' },
  { label: 'resources', icon: 'lucide:swatch-book', type: 'category' },
  { label: 'tools', icon: 'lucide:hammer', type: 'category' },
  { label: 'prompts', icon: 'lucide:message-square-quote', type: 'category' }
]

// Create a ref to track mention selections
export const mentionSelected = ref(false)
export const mentionData: Ref<CategorizedData[]> = ref(categorizedData)

// 存储文件处理回调函数
let promptFilesHandler:
  | ((
      files: Array<{
        id: string
        name: string
        type: string
        size: number
        path: string
        description?: string
        content?: string
        createdAt: number
      }>
    ) => Promise<void>)
  | null = null

// 设置文件处理回调函数
export const setPromptFilesHandler = (handler: typeof promptFilesHandler) => {
  promptFilesHandler = handler
}

// 获取文件处理回调函数
export const getPromptFilesHandler = () => promptFilesHandler

export default {
  allowedPrefixes: null,
  items: ({ query }) => {
    // If there's a query, search across all categories
    if (query) {
      const allItems: CategorizedData[] = []
      // Flatten the structure and search in all categories

      for (const item of mentionData.value) {
        if (item.label.toLowerCase().includes(query.toLowerCase())) {
          allItems.push(item)
        }
      }

      return allItems.slice(0, 5)
    }

    // If no query, return the full list
    return mentionData.value
  },

  render: () => {
    let component
    let popup

    return {
      onStart: (props) => {
        component = new VueRenderer(MentionList, {
          // using vue 2:
          // parent: this,
          // propsData: props,
          // using vue 3:
          props: {
            ...props,
            query: props.query
          },
          editor: props.editor
        })

        if (!props.clientRect) {
          return
        }

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'top-start',
          zIndex: 90
        })
      },

      onUpdate(props) {
        component.updateProps({
          ...props,
          query: props.query
        })

        if (!props.clientRect || !popup?.[0]) {
          return
        }

        popup[0].setProps({
          getReferenceClientRect: props.clientRect
        })
      },

      onKeyDown(props) {
        if (!popup?.[0]) {
          return false
        }

        if (props.event.key === 'Escape') {
          popup[0].hide()

          return true
        }

        // If Enter is pressed on a mention item
        if (props.event.key === 'Enter') {
          mentionSelected.value = true
          // Reset after a short delay
          setTimeout(() => {
            mentionSelected.value = false
          }, 300)
        }

        return component.ref?.onKeyDown(props)
      },

      onExit() {
        if (popup?.[0]) {
          popup[0].destroy()
        }
        component.destroy()
      }
    }
  }
}
