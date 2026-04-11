import { ovClient } from '#/lib/ov-client/client'
import type { AgentEvent, SSEEvent } from './types'

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

export interface StreamCallbacks {
  onResponse: (text: string) => void
  onAgentEvent: (event: AgentEvent) => void
  onDone: (sessionId: string) => void
  onError: (error: Error) => void
}

export async function streamChat(
  message: string,
  sessionId: string | undefined,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { baseUrl } = ovClient.getOptions()

  const body: Record<string, unknown> = { message, stream: true }
  if (sessionId) body.session_id = sessionId

  let response: Response
  try {
    response = await fetch(`${baseUrl}/bot/v1/chat/stream`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)))
    }
    return
  }

  if (!response.ok) {
    callbacks.onError(new Error(`Request failed: ${response.status}`))
    return
  }

  const reader = response.body?.getReader()
  if (!reader) {
    callbacks.onError(new Error('No response body'))
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''
  // session_id is not returned in SSE stream, use the one from request
  const effectiveSessionId = sessionId ?? 'default'

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Split on single newline to handle both standard SSE (`data: ...\n\n`)
      // and any proxy that strips blank-line separators. Empty lines are skipped below.
      const lines = buffer.split('\n')
      // Keep the last (possibly incomplete) chunk in the buffer
      buffer = lines.pop() ?? ''

      for (const raw of lines) {
        const line = raw.trim()
        if (!line || !line.startsWith('data: ')) continue

        try {
          const sse = JSON.parse(line.slice(6)) as SSEEvent

          if (sse.event === 'response') {
            // Check for error responses
            if (typeof sse.data === 'object' && sse.data && 'error' in (sse.data as Record<string, unknown>)) {
              callbacks.onError(new Error((sse.data as Record<string, string>).error))
              return
            }
            const text = typeof sse.data === 'string' ? sse.data : JSON.stringify(sse.data)
            callbacks.onResponse(text)
          } else {
            callbacks.onAgentEvent({
              type: sse.event,
              content: typeof sse.data === 'string' ? sse.data : JSON.stringify(sse.data, null, 2),
              timestamp: sse.timestamp,
            })
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)))
      return
    }
  }

  callbacks.onDone(effectiveSessionId)
}
