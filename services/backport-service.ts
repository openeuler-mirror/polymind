import { httpClient } from '@/lib/http-client'
import {
  BackportApplyRowRequest,
  BackportBrowseResponse,
  BackportCommitMessagePreview,
  BackportCommitMessagePreviewRequest,
  BackportConfig,
  BackportConfigUpdateResponse,
  BackportContinueReportRequest,
  BackportExecuteRequest,
  BackportGenerateReportRequest,
  BackportLoadGitLogRequest,
  BackportLoadPatchPreviewRequest,
  BackportLoadGitShowRequest,
  BackportLoadReportRequest,
  BackportManualPatchRequest,
  BackportPatchPreviewResponse,
  BackportRecheckConflictRequest,
  BackportRunAllRequest,
  BackportRunProgress,
  BackportRunResponse,
  BackportToolSnapshot,
  BackportTryResolveRequest,
} from '@/lib/backport-types'

type BackportAction =
  | 'run_all'
  | 'generate_report'
  | 'load_report'
  | 'continue_report'
  | 'recheck_conflict'
  | 'load_git_log'
  | 'load_git_show'
  | 'load_patch_preview'
  | 'preview_commit_message'
  | 'execute_selected'
  | 'apply_row'
  | 'try_resolve'
  | 'check_manual_patch'
  | 'apply_manual_patch'

type BackportRunRequest = {
  action: BackportAction
  payload: Record<string, unknown>
}

type BackportAsyncRunResponse = {
  run_id: string
  action: string
  status: 'running' | 'success' | 'failed'
  result: BackportRunResponse | null
  error: string
  progress?: BackportRunProgress | null
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

class BackportService {
  public async getConfig(): Promise<BackportConfig> {
    return httpClient.get<BackportConfig>('/backport/config')
  }

  public async updateConfig(payload: BackportConfig): Promise<BackportConfigUpdateResponse> {
    return httpClient.put<BackportConfigUpdateResponse>('/backport/config', payload)
  }

  public async browsePath(path?: string): Promise<BackportBrowseResponse> {
    const query = path ? `?path=${encodeURIComponent(path)}` : ''
    return httpClient.get<BackportBrowseResponse>(`/backport/browse${query}`)
  }

  public async loadPatchPreview(
    request: BackportLoadPatchPreviewRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportPatchPreviewResponse> {
    const response = await this.runAction(
      {
        action: 'load_patch_preview',
        payload: {
          base_report_path: request.baseReportPath,
          working_report_path: request.workingReportPath,
          row: request.row,
          patch_kind: request.kind,
        },
      },
      onEvent,
    )
    const patch = response.parsedResult?.patch
    if (!patch) {
      throw new Error('未返回 patch 预览内容')
    }
    return patch
  }

  public async previewCommitMessage(
    request: BackportCommitMessagePreviewRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportCommitMessagePreview> {
    const response = await this.runAction(
      {
        action: 'preview_commit_message',
        payload: {
          config: request.config,
          base_report_path: request.baseReportPath,
          working_report_path: request.workingReportPath,
          row: request.row,
          commit_message_template: request.commitMessageTemplate,
        },
      },
      onEvent,
    )
    const preview = response.parsedResult?.commit_message
    if (!preview) {
      throw new Error('未返回 commit message 预览内容')
    }
    return preview
  }

  public async generateReport(
    request: BackportGenerateReportRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    onEvent?.({ type: 'message.started', payload: {} })

    const runRequest: BackportRunRequest = {
      action: 'generate_report',
      payload: {
        config: request.config,
        excel_path: request.excelPath,
      },
    }
    const created = await httpClient.post<BackportAsyncRunResponse>(
      '/backport/runs',
      runRequest,
      { timeout: 30000 },
    )

    let current = created
    while (current.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 15000))
      current = await httpClient.get<BackportAsyncRunResponse>(
        `/backport/runs/${encodeURIComponent(created.run_id)}`,
        { timeout: 30000 },
      )
    }

    if (current.status === 'failed') {
      throw new Error(current.error || '生成配置与报告失败')
    }
    if (!current.result) {
      throw new Error('生成配置与报告未返回结果')
    }

    this.emitSyntheticToolEvents(current.result.toolSnapshots, onEvent)

    onEvent?.({
      type: 'message.completed',
      payload: {
        text: current.result.assistantText,
      },
    })

    return current.result
  }

  public async loadReport(request: BackportLoadReportRequest): Promise<BackportRunResponse> {
    return this.runAction({
      action: 'load_report',
      payload: {
        config: request.config,
        base_report_path: request.baseReportPath,
      },
    })
  }

  public async runAll(
    request: BackportRunAllRequest,
    onEvent?: (event: any) => void,
    onProgress?: (progress: BackportRunProgress) => void,
  ): Promise<BackportRunResponse> {
    onEvent?.({ type: 'message.started', payload: {} })

    const runRequest: BackportRunRequest = {
      action: 'run_all',
      payload: {
        config: request.config,
        excel_path: request.excelPath,
        base_report_path: request.baseReportPath,
        working_report_path: request.workingReportPath,
      },
    }
    const created = await httpClient.post<BackportAsyncRunResponse>(
      '/backport/runs',
      runRequest,
      { timeout: 30000 },
    )

    let current = created
    let lastProgressText = ''
    if (current.progress) {
      lastProgressText = JSON.stringify(current.progress)
      onProgress?.(current.progress)
    }
    while (current.status === 'running') {
      await new Promise((resolve) => setTimeout(resolve, 2000))
      current = await httpClient.get<BackportAsyncRunResponse>(
        `/backport/runs/${encodeURIComponent(created.run_id)}`,
        { timeout: 30000 },
      )
      if (current.progress) {
        const progressText = JSON.stringify(current.progress)
        if (progressText !== lastProgressText) {
          lastProgressText = progressText
          onProgress?.(current.progress)
        }
      }
    }
    if (current.progress) {
      onProgress?.(current.progress)
    }

    if (current.status === 'failed') {
      throw new Error(current.error || '一键运行失败')
    }
    if (!current.result) {
      throw new Error('一键运行未返回结果')
    }

    this.emitSyntheticToolEvents(current.result.toolSnapshots, onEvent)

    onEvent?.({
      type: 'message.completed',
      payload: {
        text: current.result.assistantText,
      },
    })

    return current.result
  }

  public async loadGitLog(
    request: BackportLoadGitLogRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'load_git_log',
        payload: {
          config: request.config,
        },
      },
      onEvent,
    )
  }

  public async continueReport(
    request: BackportContinueReportRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'continue_report',
        payload: {
          config: request.config,
          base_report_path: request.baseReportPath,
        },
      },
      onEvent,
    )
  }

  public async recheckConflict(
    request: BackportRecheckConflictRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'recheck_conflict',
        payload: {
          config: request.config,
          base_report_path: request.baseReportPath,
          working_report_path: request.workingReportPath,
          row: request.row,
        },
      },
      onEvent,
    )
  }

  public async loadGitShow(
    request: BackportLoadGitShowRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'load_git_show',
        payload: {
          config: request.config,
          revision: request.revision,
        },
      },
      onEvent,
    )
  }

  public async executeSelected(
    request: BackportExecuteRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'execute_selected',
        payload: {
          config: request.config,
          base_report_path: request.baseReportPath,
          working_report_path: request.workingReportPath,
          selected_commits: request.selectedCommits,
          save_source: request.source,
        },
      },
      onEvent,
    )
  }

  public async applyRow(
    request: BackportApplyRowRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'apply_row',
        payload: {
          config: request.config,
          base_report_path: request.baseReportPath,
          working_report_path: request.workingReportPath,
          row: request.row,
        },
      },
      onEvent,
    )
  }

  public async tryResolve(
    request: BackportTryResolveRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'try_resolve',
        payload: {
          config: request.config,
          base_report_path: request.baseReportPath,
          working_report_path: request.workingReportPath,
          row: request.row,
        },
      },
      onEvent,
    )
  }

  public async checkManualPatch(
    request: BackportManualPatchRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'check_manual_patch',
        payload: {
          config: request.config,
          patch_text: request.patchText,
        },
      },
      onEvent,
    )
  }

  public async applyManualPatch(
    request: BackportManualPatchRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    return this.runAction(
      {
        action: 'apply_manual_patch',
        payload: {
          config: request.config,
          patch_text: request.patchText,
        },
      },
      onEvent,
    )
  }

  private async runAction(
    request: BackportRunRequest,
    onEvent?: (event: any) => void,
  ): Promise<BackportRunResponse> {
    onEvent?.({ type: 'message.started', payload: {} })

    const response = await httpClient.post<BackportRunResponse>(
      '/backport/run',
      request,
      { timeout: 600000 },
    )
    this.emitSyntheticToolEvents(response.toolSnapshots, onEvent)

    onEvent?.({
      type: 'message.completed',
      payload: {
        text: response.assistantText,
      },
    })

    return response
  }

  private emitSyntheticToolEvents(
    toolSnapshots: BackportToolSnapshot[],
    onEvent?: (event: any) => void,
  ): void {
    if (!onEvent) return

    for (const snapshot of toolSnapshots) {
      const parsedArguments = parseJsonObject(snapshot.arguments_text)
      onEvent({
        type: 'tool.call.started',
        payload: {
          tool_name: snapshot.tool_name,
          arguments: parsedArguments,
        },
      })
      onEvent({
        type: 'tool.call.response',
        payload: {
          name: snapshot.tool_name,
          content: snapshot.response_text,
          is_error: snapshot.is_error,
        },
      })
    }
  }
}

export const backportService = new BackportService()
