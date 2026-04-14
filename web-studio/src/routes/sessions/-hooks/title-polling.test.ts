import { describe, expect, it } from 'vitest'

import {
  getSessionListTitlePollInterval,
  getSessionTitlePollInterval,
} from './title-polling'

describe('title polling', () => {
  it('polls the session list while any title is provisional', () => {
    expect(
      getSessionListTitlePollInterval([
        {
          is_dir: true,
          session_id: 'session-1',
          title: '你好',
          title_status: 'provisional',
          uri: 'viking://session/default/session-1',
        },
      ]),
    ).toBe(1500)
  })

  it('stops polling the session list when all titles are settled', () => {
    expect(
      getSessionListTitlePollInterval([
        {
          is_dir: true,
          session_id: 'session-1',
          title: '日常问候交流',
          title_status: 'final',
          uri: 'viking://session/default/session-1',
        },
      ]),
    ).toBe(false)
  })

  it('polls the active session while its title is provisional', () => {
    expect(
      getSessionTitlePollInterval({
        title_status: 'provisional',
      }),
    ).toBe(1500)
  })

  it('stops polling the active session after the title is final', () => {
    expect(
      getSessionTitlePollInterval({
        title_status: 'final',
      }),
    ).toBe(false)
  })
})
