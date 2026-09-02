import {
  DEFAULT_BACKPORT_CONFIG,
  normalizeBackportConfig,
  resolveBackportModelReference,
} from '@/components/tool-panel/backport/utils'
import type { BackportConfig } from '@/lib/backport-types'
import type { ModelConfig } from '@/lib/types'

function model(overrides: Partial<ModelConfig> = {}): ModelConfig {
  return {
    id: 'model-1',
    name: 'Model 1',
    provider: 'openai',
    enabled: true,
    isDefault: false,
    createdAt: '2026-08-27T00:00:00Z',
    updatedAt: '2026-08-27T00:00:00Z',
    ...overrides,
  }
}

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

describe('resolveBackportModelReference', () => {
  it('preserves an existing configured model', () => {
    expect(resolveBackportModelReference('model-1', [model()])).toEqual({
      modelId: 'model-1',
      repaired: false,
      shouldOpenSelector: false,
    })
  })

  it('repairs a stale model reference with the default model', () => {
    const models = [model(), model({ id: 'model-2', isDefault: true })]

    expect(resolveBackportModelReference('deleted-model', models)).toEqual({
      modelId: 'model-2',
      repaired: true,
      shouldOpenSelector: false,
    })
  })

  it('repairs a stale model reference with the only compatible model', () => {
    expect(resolveBackportModelReference('deleted-model', [model()])).toEqual({
      modelId: 'model-1',
      repaired: true,
      shouldOpenSelector: false,
    })
  })

  it('clears a stale reference and opens the selector when a choice is required', () => {
    const models = [model(), model({ id: 'model-2' })]

    expect(resolveBackportModelReference('deleted-model', models)).toEqual({
      modelId: '',
      repaired: true,
      shouldOpenSelector: true,
    })
  })

  it('clears a stale reference when no compatible models remain', () => {
    expect(resolveBackportModelReference('deleted-model', [])).toEqual({
      modelId: '',
      repaired: true,
      shouldOpenSelector: false,
    })
  })
})
