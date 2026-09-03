// Markdown 渲染共用清洗配置：GitHub 风格默认白名单 + 保留 className。
// 用于过滤 LLM 输出/文档中不可识别的 HTML 标签（如 <t>），防止渲染报错与 XSS。
import { defaultSchema } from 'rehype-sanitize'

const markdownAttributes = defaultSchema.attributes ?? {}

export const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...markdownAttributes,
    '*': [...(markdownAttributes['*'] ?? []), 'className'],
  },
}
