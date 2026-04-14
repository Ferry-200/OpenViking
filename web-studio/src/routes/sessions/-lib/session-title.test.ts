import { describe, expect, it } from 'vitest'

import { getSessionDisplayTitle } from './session-title'

describe('getSessionDisplayTitle', () => {
  it('prefers the backend title when present', () => {
    expect(
      getSessionDisplayTitle({
        session_id: 'session-123',
        title: 'Deploy rollback',
      }),
    ).toBe('Deploy rollback')
  })

  it('uses a fallback title when the primary title is blank', () => {
    expect(
      getSessionDisplayTitle({
        session_id: 'session-123',
        title: '   ',
      }, {
        fallbackTitle: 'Refined fallback',
      }),
    ).toBe('Refined fallback')
  })

  it('uses the untitled label when no title is available', () => {
    expect(
      getSessionDisplayTitle({
        session_id: 'session-123',
        title: '   ',
      }, {
        untitledLabel: '新会话',
      }),
    ).toBe('新会话')
  })
})
