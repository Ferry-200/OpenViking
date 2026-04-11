import { useCallback, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import { Bot, MessageSquarePlus, Send, Square, Trash2, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '#/components/ui/button'
import { ScrollArea } from '#/components/ui/scroll-area'
import { AgentEvents } from '#/components/bot/agent-events'
import {
  createSession,
  deleteSession,
  listSessions,
  type ChatMessage,
  type Session,
} from '#/lib/bot/chat-client'
import { streamChat } from '#/lib/bot/stream-client'
import type { AgentEvent } from '#/lib/bot/types'
import { applyLegacyConnectionSettings, loadLegacyConnectionSettings } from '#/lib/legacy/connection'

export function VikingBotPage() {
  const { t } = useTranslation()
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    applyLegacyConnectionSettings(loadLegacyConnectionSettings())
    listSessions().then(setSessions).catch(() => {})
  }, [])

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleNewSession = useCallback(async () => {
    try {
      const session = await createSession()
      setSessions(prev => [session, ...prev])
      setActiveSessionId(session.session_id)
      setMessages([])
      setError(null)
    } catch {
      setError('Failed to create session')
    }
  }, [])

  const handleDeleteSession = useCallback(async (sid: string) => {
    try {
      await deleteSession(sid)
      setSessions(prev => prev.filter(s => s.session_id !== sid))
      if (activeSessionId === sid) {
        setActiveSessionId(undefined)
        setMessages([])
      }
    } catch {
      // ignore
    }
  }, [activeSessionId])

  const handleSelectSession = useCallback((sid: string) => {
    setActiveSessionId(sid)
    setMessages([])
    setError(null)
  }, [])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStreaming(false)
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    setError(null)
    setStreaming(true)

    const userMessage: ChatMessage = { role: 'user', content: text }
    const assistantMessage: ChatMessage = { role: 'assistant', content: '', events: [], streaming: true }
    setMessages(prev => [...prev, userMessage, assistantMessage])

    const controller = new AbortController()
    abortRef.current = controller

    await streamChat(
      text,
      activeSessionId,
      {
        onResponse(chunk: string) {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + chunk }
            }
            return updated
          })
        },
        onAgentEvent(event: AgentEvent) {
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                events: [...(last.events ?? []), event],
              }
            }
            return updated
          })
        },
        onDone(sid: string) {
          setActiveSessionId(sid)
          if (!sessions.some(s => s.session_id === sid)) {
            setSessions(prev => [{ session_id: sid, created_at: new Date().toISOString() }, ...prev])
          }
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, streaming: false }
            }
            return updated
          })
          setStreaming(false)
          abortRef.current = null
        },
        onError(err: Error) {
          setError(err.message || t('vikingbot.error'))
          setMessages(prev => {
            const updated = [...prev]
            const last = updated[updated.length - 1]
            if (last.role === 'assistant' && !last.content) {
              return updated.slice(0, -1)
            }
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, streaming: false }
            }
            return updated
          })
          setStreaming(false)
          abortRef.current = null
        },
      },
      controller.signal,
    )
  }, [input, streaming, activeSessionId, sessions, t])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  return (
    <div className="flex h-full">
      {/* Session sidebar */}
      <aside className="w-60 shrink-0 border-r flex flex-col">
        <div className="p-3 flex items-center justify-between border-b">
          <h2 className="text-sm font-medium">{t('vikingbot.sessions')}</h2>
          <Button size="icon" variant="ghost" className="size-7" onClick={handleNewSession}>
            <MessageSquarePlus className="size-4" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {sessions.length === 0 && (
              <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                {t('vikingbot.noSessions')}
              </p>
            )}
            {sessions.map(s => (
              <div
                key={s.session_id}
                className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted transition-colors ${
                  activeSessionId === s.session_id ? 'bg-muted' : ''
                }`}
                onClick={() => handleSelectSession(s.session_id)}
              >
                <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1 text-xs">
                  {s.session_id.slice(0, 12)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-6 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteSession(s.session_id)
                  }}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex flex-col gap-1 p-4 pb-2">
          <h1 className="text-2xl font-semibold tracking-tight">{t('vikingbot.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('vikingbot.description')}</p>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="size-4 text-primary" />
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <Markdown>{msg.content || (msg.streaming ? '...' : '')}</Markdown>
                    </div>
                    {msg.events && msg.events.length > 0 && (
                      <AgentEvents events={msg.events} />
                    )}
                  </>
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <User className="size-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}
          {streaming && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-3 justify-start">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bot className="size-4 text-primary" />
              </div>
              <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                {t('vikingbot.thinking')}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex gap-2 border-t p-4">
          <textarea
            className="flex-1 resize-none rounded-xl border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            rows={1}
            placeholder={t('vikingbot.placeholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming}
          />
          {streaming ? (
            <Button size="icon" variant="destructive" onClick={handleStop}>
              <Square className="size-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
