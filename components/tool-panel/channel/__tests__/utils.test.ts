import { channelDisplayName, channelFieldLabel } from '@/components/tool-panel/channel/utils'
import type { ChannelCatalogItem } from '@/services/channel-service'

const catalog: ChannelCatalogItem[] = [
  {
    channel: 'qq_bot',
    display_name: 'QQ 机器人',
    adapter_version: '1.0.0',
    supports_provisioning: true,
    credential_fields: [],
    config_fields: [],
    capabilities: { can_edit_message: true, max_text_length: 4500, max_reply_segments: 4 },
  },
]

/** 模拟 i18next：命中返回译文，缺键时回退 defaultValue（默认回显 key）。 */
function translateWith(dictionary: Record<string, string>) {
  return (key: string, options?: { defaultValue?: string }) =>
    dictionary[key] ?? options?.defaultValue ?? key
}

/** 模拟未启用缺键告警的 i18next：即使给了 defaultValue 也回显 key。 */
function translateEchoingKey() {
  return (key: string) => key
}

describe('channelDisplayName', () => {
  it('使用前端翻译键覆盖适配器声明的展示名', () => {
    const t = translateWith({ 'channels.qq_bot.displayName': 'QQ Bot' })

    expect(channelDisplayName(t, 'qq_bot', catalog)).toBe('QQ Bot')
  })

  it('缺少翻译时回退到 catalog 的 display_name', () => {
    const t = translateWith({})

    expect(channelDisplayName(t, 'qq_bot', catalog)).toBe('QQ 机器人')
  })

  it('catalog 未登记且无翻译时回退到渠道标识符', () => {
    const t = translateWith({})

    expect(channelDisplayName(t, 'unknown_bot', catalog)).toBe('unknown_bot')
  })

  it('翻译函数回显 key 时同样回退到适配器声明的展示名', () => {
    expect(channelDisplayName(translateEchoingKey(), 'qq_bot', catalog)).toBe('QQ 机器人')
  })
})

describe('channelFieldLabel', () => {
  const field = { name: 'app_id', label: '机器人 AppID' }

  it('使用前端翻译键覆盖适配器声明的字段标签', () => {
    const t = translateWith({ 'channels.qq_bot.fields.app_id': 'Bot AppID' })

    expect(channelFieldLabel(t, 'qq_bot', field)).toBe('Bot AppID')
  })

  it('缺少翻译时回退到适配器声明的 label', () => {
    const t = translateWith({})

    expect(channelFieldLabel(t, 'qq_bot', field)).toBe('机器人 AppID')
  })
})
