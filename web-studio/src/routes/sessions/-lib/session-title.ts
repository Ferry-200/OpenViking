import type { SessionListItem, SessionMeta } from '../-types/session'

type SessionTitleSource =
  | Pick<SessionListItem, 'session_id' | 'title'>
  | Pick<SessionMeta, 'session_id' | 'title'>

type SessionTitleOptions = {
  fallbackTitle?: string
  untitledLabel?: string
}

export function getSessionDisplayTitle(
  session: SessionTitleSource,
  options: SessionTitleOptions = {},
): string {
  const title = session.title.trim()
  if (title) {
    return title
  }

  const fallbackTitle = options.fallbackTitle?.trim()
  if (fallbackTitle) {
    return fallbackTitle
  }

  return options.untitledLabel?.trim() || session.session_id
}
