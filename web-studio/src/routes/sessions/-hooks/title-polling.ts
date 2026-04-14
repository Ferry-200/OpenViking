import type { SessionListItem, SessionMeta } from '../-types/session'

const TITLE_POLL_INTERVAL_MS = 1500

export function getSessionListTitlePollInterval(
  sessions: SessionListItem[] | undefined,
): number | false {
  return sessions?.some((session) => session.title_status === 'provisional')
    ? TITLE_POLL_INTERVAL_MS
    : false
}

export function getSessionTitlePollInterval(
  session: Pick<SessionMeta, 'title_status'> | undefined,
): number | false {
  return session?.title_status === 'provisional' ? TITLE_POLL_INTERVAL_MS : false
}
