/**
 * 与服务端 Pydantic 约束对齐的输入长度上限。
 *
 * 前端 maxLength 只是「提前拦截 + 不给用户白填一屏」的体验层限制，
 * 权威校验始终在后端（超限返回 422 + 通用失败文案）。
 */

/** AgentCreateRequest / AgentUpdateRequest .name（min_length=1, max_length=255） */
export const AGENT_NAME_MAX_LENGTH = 255

/** AgentCreateRequest / AgentUpdateRequest .description（max_length=2000） */
export const AGENT_DESCRIPTION_MAX_LENGTH = 2000

/** SessionUpdateRequest .title（min_length=1, max_length=255），即会话重命名。 */
export const CONVERSATION_TITLE_MAX_LENGTH = 255
