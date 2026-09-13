import type { ToolCall } from './types'

/**
 * 工具类别：决定时间线上一行「标签 · 目标」的渲染方式。
 * 不同运行时/适配器的工具名差异较大（read / read_file / mcp__fs__read），
 * 因此先归一化再归类，未知工具回退到 other。
 */
export type ToolCallKind =
  | 'read'
  | 'write'
  | 'edit'
  | 'exec'
  | 'search'
  | 'list'
  | 'question'
  | 'todo'
  | 'skill'
  | 'web'
  | 'delegate'
  | 'other'

const TOOL_KIND_BY_NAME: Record<string, ToolCallKind> = {
  read: 'read',
  read_file: 'read',
  readfile: 'read',
  read_image: 'read',
  view: 'read',
  cat: 'read',
  write: 'write',
  write_file: 'write',
  writefile: 'write',
  create_file: 'write',
  createfile: 'write',
  edit: 'edit',
  edit_file: 'edit',
  editfile: 'edit',
  multiedit: 'edit',
  str_replace: 'edit',
  apply_patch: 'edit',
  patch: 'edit',
  exec: 'exec',
  bash: 'exec',
  shell: 'exec',
  run: 'exec',
  run_command: 'exec',
  run_code: 'exec',
  terminal: 'exec',
  process: 'exec',
  grep: 'search',
  rg: 'search',
  ripgrep: 'search',
  search: 'search',
  find: 'search',
  glob: 'list',
  ls: 'list',
  list: 'list',
  list_files: 'list',
  list_dir: 'list',
  question: 'question',
  ask: 'question',
  ask_user_question: 'question',
  todo_write: 'todo',
  todowrite: 'todo',
  todo: 'todo',
  update_plan: 'todo',
  plan: 'todo',
  skill: 'skill',
  load_skill: 'skill',
  use_skill: 'skill',
  web: 'web',
  web_search: 'web',
  websearch: 'web',
  web_fetch: 'web',
  webfetch: 'web',
  fetch: 'web',
  browser: 'web',
  task: 'delegate',
  agent: 'delegate',
  delegate: 'delegate',
  subagent: 'delegate',
}

/** 目标字段的候选键：按类别给出优先级，取第一个非空字符串。 */
const TARGET_KEYS: Record<ToolCallKind, string[]> = {
  read: ['file_path', 'filePath', 'path', 'file', 'filename', 'url'],
  write: ['file_path', 'filePath', 'path', 'file', 'filename'],
  edit: ['file_path', 'filePath', 'path', 'file', 'filename'],
  exec: ['command', 'cmd', 'script', 'code', 'description'],
  search: ['pattern', 'query', 'regex', 'keyword', 'q'],
  list: ['pattern', 'path', 'dir', 'directory', 'glob'],
  question: ['header', 'question', 'title'],
  todo: ['summary', 'title', 'description'],
  skill: ['name', 'skill', 'skill_name'],
  web: ['url', 'query', 'q'],
  delegate: ['description', 'prompt', 'task', 'name'],
  other: [],
}

/** 未知工具兜底：常见「意图类」参数键。 */
const FALLBACK_TARGET_KEYS = [
  'file_path',
  'filePath',
  'path',
  'command',
  'pattern',
  'query',
  'url',
  'name',
  'title',
  'summary',
  'description',
]

/** 目标行过长时的截断长度：一行放得下又不至于把布局撑开。 */
export const MAX_TOOL_TARGET_LENGTH = 80

/** 归一化工具名：小写 + 去掉 mcp / 命名空间前缀（mcp__fs__read → read）。 */
export function normalizeToolName(name: string): string {
  const lower = (name || '').trim().toLowerCase()
  if (!lower) return ''
  const segments = lower.split(/__|[./:]/).filter(Boolean)
  return segments.length > 0 ? segments[segments.length - 1] : lower
}

export function resolveToolKind(name: string): ToolCallKind {
  return TOOL_KIND_BY_NAME[normalizeToolName(name)] ?? 'other'
}

function toSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function truncate(text: string, max = MAX_TOOL_TARGET_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function pickString(
  input: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null {
  if (!input) return null
  for (const key of keys) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/** 取第一个非空字符串参数值（未知工具兜底）。 */
function pickFirstString(input: Record<string, unknown> | null | undefined): string | null {
  if (!input) return null
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * 从工具入参中提取「这一步做了什么」的一行摘要。
 * 提取不到时返回 null，由调用方回落为只显示标签。
 */
/** 待办类工具：入参是 todos 数组，取首条内容（其余只标数量）。 */
function describeTodoTarget(input?: Record<string, unknown> | null): string | null {
  const todos = input?.todos
  if (!Array.isArray(todos) || todos.length === 0) return null
  const first = todos[0]
  const raw =
    typeof first === 'string'
      ? first
      : typeof first === 'object' && first !== null
        ? ((first as Record<string, unknown>).content ??
          (first as Record<string, unknown>).text ??
          (first as Record<string, unknown>).title)
        : null
  if (typeof raw !== 'string' || !raw.trim()) return null
  const suffix = todos.length > 1 ? ` (+${todos.length - 1})` : ''
  return truncate(`${toSingleLine(raw)}${suffix}`)
}

export function extractToolTarget(
  kind: ToolCallKind,
  input?: Record<string, unknown> | null
): string | null {
  if (kind === 'todo') {
    const todoTarget = describeTodoTarget(input)
    if (todoTarget) return todoTarget
  }
  const keys = TARGET_KEYS[kind]
  const raw = pickString(input, keys.length > 0 ? keys : FALLBACK_TARGET_KEYS)
  const value = raw ?? pickFirstString(input)
  if (!value) return null
  const single = toSingleLine(value)
  return single ? truncate(single) : null
}

export interface ToolCallDescription {
  kind: ToolCallKind
  /** 归一化后的工具名，用于 i18n key 与兜底展示 */
  name: string
  /** 行首标签（i18n key，例如 message.toolCall.names.read），由组件翻译 */
  labelKey: string
  target: string | null
}

/**
 * 工具调用的一行描述：标签 + 目标。
 * target 只来自入参（`input`）；`outputRaw` 是执行中的增量输出，不是「操作目标」，
 * 不能拿来当 target（否则 exec 会把 stdout 显示成命令）。
 */
export function describeToolCall(toolCall: ToolCall): ToolCallDescription {
  const kind = resolveToolKind(toolCall.name)
  const target = extractToolTarget(kind, toolCall.input)

  return {
    kind,
    name: toolCall.name,
    labelKey: kind === 'other' ? '' : `message.toolCall.names.${kind}`,
    target,
  }
}

/**
 * 折叠态下的一行结果预览：只对「单行且足够短」的输出生效，
 * 让用户无需展开就知道这一步产出了什么（长输出/多行输出仍走展开面板）。
 */
export function previewToolOutput(content: string | null | undefined, max = 120): string | null {
  if (!content) return null
  const single = toSingleLine(content)
  if (!single || single.length > max) return null
  return single
}
