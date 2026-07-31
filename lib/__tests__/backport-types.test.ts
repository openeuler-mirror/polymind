import {
  resetRunAllStateForGeneratedReport,
  type BackportRunAllUiState,
} from '../backport-types'

describe('resetRunAllStateForGeneratedReport', () => {
  it('clears paused one-click run state when a new report is generated', () => {
    const pausedState: BackportRunAllUiState = {
      pauseState: 'paused',
      progress: {
        phase: 'paused',
        message: '当前 report 已保存，可继续一键运行',
        current_report_path: '/tmp/old.report.yml',
      },
      control: { runId: 'old-run', pause: jest.fn() },
      rowStartedAt: { abc123: 1 },
      lastProcessedCount: 3,
      reportRefreshInFlight: true,
      pendingReportRefreshPath: '/tmp/old.report.yml',
      statusCardVisible: true,
    }

    expect(resetRunAllStateForGeneratedReport(pausedState)).toEqual({
      pauseState: 'idle',
      progress: null,
      control: null,
      rowStartedAt: {},
      lastProcessedCount: 0,
      reportRefreshInFlight: false,
      pendingReportRefreshPath: null,
      statusCardVisible: false,
    })
  })
})
