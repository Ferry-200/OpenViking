export type AgentEventType = 'response' | 'tool_call' | 'tool_result' | 'reasoning' | 'iteration'

export interface SSEEvent {
  event: AgentEventType
  data: unknown
  timestamp: string
}

export interface AgentEvent {
  type: AgentEventType
  content: string
  timestamp: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  events?: AgentEvent[]
  streaming?: boolean
}

export interface Session {
  session_id: string
  created_at?: string
  metadata?: Record<string, unknown>
}
