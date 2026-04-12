import { ovClient } from '#/lib/ov-client/client'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatResponse {
  sessionId: string
  message: string
}

export async function sendChat(
  message: string,
  sessionId?: string,
  signal?: AbortSignal,
): Promise<ChatResponse> {
  const { baseUrl } = ovClient.getOptions()
  const connection = ovClient.getConnection()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (connection.apiKey) headers['X-API-Key'] = connection.apiKey
  if (connection.accountId) headers['X-OpenViking-Account'] = connection.accountId
  if (connection.userId) headers['X-OpenViking-User'] = connection.userId
  if (connection.agentId) headers['X-OpenViking-Agent'] = connection.agentId

  const body: Record<string, string> = { message }
  if (sessionId) body.session_id = sessionId

  const response = await fetch(`${baseUrl}/bot/v1/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  const data = await response.json() as { session_id?: string; message?: string }
  return {
    sessionId: data.session_id ?? sessionId ?? 'default',
    message: data.message ?? '',
  }
}
