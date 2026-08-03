/**
 * 将工具调用输出/内容格式化为可读字符串。
 * 供 stream-event-handler、agent-stream-events 和 UI 组件共用。
 */
export function formatToolOutput(content: any): string {
  if (content === null || content === undefined) {
    return ''
  }
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    const texts = content
      .filter((item: any) => item && item.type === 'text' && typeof item.text === 'string')
      .map((item: any) => item.text)
      .join('\n')
    if (texts) return texts
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return '[无法序列化的内容]'
    }
  }
  if (typeof content === 'object') {
    if (content.details?.content) {
      const dc = content.details.content
      return typeof dc === 'string' ? dc : JSON.stringify(dc)
    }
    if (content.text && typeof content.text === 'string') {
      return content.text
    }
    if (Array.isArray(content.content)) {
      const texts = content.content
        .filter((item: any) => item && item.type === 'text' && typeof item.text === 'string')
        .map((item: any) => item.text)
        .join('\n')
      if (texts) return texts
    }
    if (content.error && typeof content.error === 'string') return content.error
    if (content.message && typeof content.message === 'string') return content.message
    try {
      return JSON.stringify(content, null, 2)
    } catch {
      return '[无法序列化的内容]'
    }
  }
  try {
    return String(content)
  } catch {
    return '[无法转换的内容]'
  }
}
