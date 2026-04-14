// @vitest-environment jsdom

import * as React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChat } from './use-chat'

const { addMessageMock, sendChatStreamMock } = vi.hoisted(() => ({
  addMessageMock: vi.fn(),
  sendChatStreamMock: vi.fn(),
}))

vi.mock('../-lib/api', () => ({
  addMessage: addMessageMock,
  sendChatStream: sendChatStreamMock,
  serializeParts: (parts: unknown) => parts,
}))

vi.mock('../-lib/sse', () => ({
  parseSseStream: vi.fn(),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useChat', () => {
  beforeEach(() => {
    addMessageMock.mockReset()
    sendChatStreamMock.mockReset()
  })

  it('persists the user message even when the streaming request fails', async () => {
    addMessageMock.mockResolvedValue({
      message_count: 1,
      session_id: 'session-1',
    })
    sendChatStreamMock.mockRejectedValue(new Error('chat failed'))

    const { result } = renderHook(
      () => useChat({ sessionId: 'session-1', persistMessages: true }),
      { wrapper: createWrapper() },
    )

    await act(async () => {
      await result.current.send('你好！')
    })

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })

    expect(addMessageMock).toHaveBeenCalledTimes(1)
    expect(addMessageMock).toHaveBeenCalledWith('session-1', 'user', '你好！')
    expect(sendChatStreamMock).toHaveBeenCalledTimes(1)
    expect(addMessageMock.mock.invocationCallOrder[0]).toBeLessThan(
      sendChatStreamMock.mock.invocationCallOrder[0],
    )
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]?.role).toBe('user')
    expect(result.current.error).toBe('chat failed')
  })
})
