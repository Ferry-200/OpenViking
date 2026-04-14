import { describe, expect, it } from 'vitest'

import { resolveDefaultBaseUrl, resolveStoredBaseUrl } from './app-connection-defaults'

describe('resolveDefaultBaseUrl', () => {
  it('uses the backend port by default when running from the Vite dev origin', () => {
    expect(
      resolveDefaultBaseUrl({
        browserOrigin: 'http://localhost:3000',
      }),
    ).toBe('http://127.0.0.1:1933')
  })

  it('prefers an explicit env base url', () => {
    expect(
      resolveDefaultBaseUrl({
        browserOrigin: 'http://localhost:3000',
        envBaseUrl: 'http://localhost:1944/',
      }),
    ).toBe('http://localhost:1944')
  })
})

describe('resolveStoredBaseUrl', () => {
  it('migrates the old same-origin dev default to the backend port', () => {
    expect(
      resolveStoredBaseUrl({
        browserOrigin: 'http://localhost:3000',
        defaultBaseUrl: 'http://127.0.0.1:1933',
        storedBaseUrl: 'http://localhost:3000',
      }),
    ).toBe('http://127.0.0.1:1933')
  })

  it('keeps an explicit stored backend url', () => {
    expect(
      resolveStoredBaseUrl({
        browserOrigin: 'http://localhost:3000',
        defaultBaseUrl: 'http://127.0.0.1:1933',
        storedBaseUrl: 'http://localhost:1933',
      }),
    ).toBe('http://localhost:1933')
  })
})
