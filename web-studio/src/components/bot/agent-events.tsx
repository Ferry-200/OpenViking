import { Brain, CheckCircle, ChevronRight, RotateCw, Wrench } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '#/components/ui/badge'
import type { AgentEvent, AgentEventType } from '#/lib/bot/types'

const EVENT_ICON: Record<AgentEventType, typeof Brain> = {
  reasoning: Brain,
  tool_call: Wrench,
  tool_result: CheckCircle,
  iteration: RotateCw,
  response: Brain,
}

const EVENT_LABEL_KEY: Record<AgentEventType, string> = {
  reasoning: 'vikingbot.reasoning',
  tool_call: 'vikingbot.toolCall',
  tool_result: 'vikingbot.toolResult',
  iteration: 'vikingbot.iteration',
  response: 'vikingbot.reasoning',
}

export function AgentEvents({ events }: { events: AgentEvent[] }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  if (events.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {t('vikingbot.steps', { count: events.length })}
        </Badge>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 border-l-2 border-muted pl-3">
          {events.map((event, i) => {
            const Icon = EVENT_ICON[event.type] ?? Brain
            return (
              <div key={i} className="flex items-start gap-2 text-xs">
                <Icon className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <span className="font-medium text-muted-foreground">
                    {t(EVENT_LABEL_KEY[event.type] ?? 'vikingbot.reasoning')}
                  </span>
                  <pre className="mt-0.5 whitespace-pre-wrap break-all text-[11px] text-foreground/70 font-mono">
                    {event.content}
                  </pre>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
