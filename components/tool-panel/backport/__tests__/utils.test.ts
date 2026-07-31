import {
  DEFAULT_BACKPORT_CONFIG,
  normalizeBackportConfig,
} from '@/components/tool-panel/backport/utils'
import type { BackportConfig } from '@/lib/backport-types'

describe('normalizeBackportConfig', () => {
  it('defaults target config layout to disabled with the recommended level', () => {
    const config = normalizeBackportConfig({})

    expect(config.target_config_layout).toBe('none')
    expect(config.target_config_layout_opts).toEqual({
      default_level: 'L1-RECOMMEND',
    })
  })

  it('preserves a valid Anolis split-config layout', () => {
    const config = normalizeBackportConfig({
      target_config_layout: 'anolis',
      target_config_layout_opts: {
        default_level: 'L2-OPTIONAL',
      },
    })

    expect(config.target_config_layout).toBe('anolis')
    expect(config.target_config_layout_opts.default_level).toBe('L2-OPTIONAL')
  })

  it('normalizes unsupported values returned by an older or incompatible backend', () => {
    const config = normalizeBackportConfig({
      target_config_layout: 'unsupported',
      target_config_layout_opts: {
        default_level: 'unsupported',
      },
    } as unknown as Partial<BackportConfig>)

    expect(config.target_config_layout).toBe(DEFAULT_BACKPORT_CONFIG.target_config_layout)
    expect(config.target_config_layout_opts).toEqual(
      DEFAULT_BACKPORT_CONFIG.target_config_layout_opts
    )
  })
})
