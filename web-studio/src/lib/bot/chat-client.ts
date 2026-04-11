import { ovClient } from '#/lib/ov-client/client'
import type { ChatMessage, Session } from './types'

export type { ChatMessage, Session }
export type { AgentEvent, AgentEventType, SSEEvent } from './types'

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

// --- Session management ---

function buildHeaders(): Record<string, string> {
  const connection = ovClient.getConnection()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (connection.apiKey) headers['X-API-Key'] = connection.apiKey
  if (connection.accountId) headers['X-OpenViking-Account'] = connection.accountId
  if (connection.userId) headers['X-OpenViking-User'] = connection.userId
  if (connection.agentId) headers['X-OpenViking-Agent'] = connection.agentId
  return headers
}

export async function listSessions(): Promise<Session[]> {
  const { baseUrl } = ovClient.getOptions()
  const response = await fetch(`${baseUrl}/bot/v1/sessions`, {
    headers: buildHeaders(),
  })
  if (!response.ok) return []
  const data = await response.json() as { sessions?: Session[] }
  return data.sessions ?? []
}

export async function createSession(): Promise<Session> {
  const { baseUrl } = ovClient.getOptions()
  const response = await fetch(`${baseUrl}/bot/v1/sessions`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({}),
  })
  if (!response.ok) throw new Error(`Failed to create session: ${response.status}`)
  return await response.json() as Session
}

export async function deleteSession(sessionId: string): Promise<void> {
  const { baseUrl } = ovClient.getOptions()
  const response = await fetch(`${baseUrl}/bot/v1/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  })
  if (!response.ok) throw new Error(`Failed to delete session: ${response.status}`)
}
