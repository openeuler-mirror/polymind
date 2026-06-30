import {
  buildModelChartData,
  buildTokenChartData,
  fillModelBuckets,
  fillTokenBuckets,
} from '@/components/tool-panel/insight/timeseries-utils'

describe('insight timeseries helpers', () => {
  it('fills missing token buckets and keeps existing token values', () => {
    const filled = fillTokenBuckets(
      [
        {
          bucket_start_ns: 0,
          input_tokens: 1,
          output_tokens: 2,
          total_tokens: 3,
        },
        {
          bucket_start_ns: 2_000_000_000,
          input_tokens: 2,
          output_tokens: 3,
          total_tokens: 5,
        },
      ],
      0,
      4_000_000_000,
      4
    )

    expect(filled.map(item => item.total_tokens)).toEqual([3, 0, 5, 0])

    const chart = buildTokenChartData({
      data: filled,
      startNs: 0,
      endNs: 4_000_000_000,
      bucketCount: 4,
    })

    expect(chart.chartData).toHaveLength(4)
    expect(chart.chartData.map(item => item.total)).toEqual([3, 0, 5, 0])
    expect(chart.ticks).toEqual(chart.chartData.map(item => item.label))
  })

  it('normalizes sparse model buckets into stacked chart rows', () => {
    const filled = fillModelBuckets(
      [
        {
          bucket_start_ns: 0,
          model: 'glm-4.5',
          total_tokens: 10,
        },
        {
          bucket_start_ns: 2_000_000_000,
          model: 'deepseek',
          total_tokens: 6,
        },
      ],
      0,
      4_000_000_000,
      4,
      ['deepseek', 'glm-4.5']
    )

    expect(filled).toHaveLength(8)

    const chart = buildModelChartData({
      data: filled,
      startNs: 0,
      endNs: 4_000_000_000,
      bucketCount: 4,
    })

    expect(chart.models).toEqual(['deepseek', 'glm-4.5'])
    expect(chart.chartData).toHaveLength(4)
    expect(chart.chartData[0]).toMatchObject({ deepseek: 0, 'glm-4.5': 10 })
    expect(chart.chartData[2]).toMatchObject({ deepseek: 6, 'glm-4.5': 0 })
    expect(chart.ticks).toEqual(chart.chartData.map(item => item.label))
  })
})
