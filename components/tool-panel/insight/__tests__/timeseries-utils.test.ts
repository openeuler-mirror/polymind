import {
  buildModelChartData,
  buildTokenChartData,
  fillModelBuckets,
  fillTokenBuckets,
} from '@/components/tool-panel/insight/timeseries-utils'

describe('insight timeseries helpers', () => {
  it('returns empty token buckets for invalid time ranges', () => {
    expect(
      fillTokenBuckets(
        [
          {
            bucket_start_ns: 100,
            input_tokens: 1,
            output_tokens: 2,
            total_tokens: 3,
          },
        ],
        100,
        100,
        30
      )
    ).toEqual([])

    const chart = buildTokenChartData({
      data: [
        {
          bucket_start_ns: 100,
          input_tokens: 1,
          output_tokens: 2,
          total_tokens: 3,
        },
      ],
      startNs: 100,
      endNs: 100,
      bucketCount: 30,
    })

    expect(chart.filled).toEqual([])
    expect(chart.chartData).toEqual([])
    expect(chart.ticks).toEqual([])
  })

  it('returns empty model buckets for invalid time ranges', () => {
    expect(
      fillModelBuckets(
        [
          {
            bucket_start_ns: 200,
            model: 'glm-4.5',
            total_tokens: 8,
          },
        ],
        200,
        100,
        30,
        ['glm-4.5']
      )
    ).toEqual([])

    const chart = buildModelChartData({
      data: [
        {
          bucket_start_ns: 200,
          model: 'glm-4.5',
          total_tokens: 8,
        },
      ],
      startNs: 200,
      endNs: 100,
      bucketCount: 30,
    })

    expect(chart.filled).toEqual([])
    expect(chart.chartData).toEqual([])
    expect(chart.models).toEqual([])
    expect(chart.ticks).toEqual([])
  })
})
