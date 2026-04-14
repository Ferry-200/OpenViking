function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function isLocalViteOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return (
      url.port === '3000' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    )
  } catch {
    return false
  }
}

export function resolveDefaultBaseUrl({
  browserOrigin,
  envBaseUrl,
}: {
  browserOrigin?: string
  envBaseUrl?: string
}): string {
  const normalizedEnvBaseUrl = trimTrailingSlashes(envBaseUrl || '')
  if (normalizedEnvBaseUrl) {
    return normalizedEnvBaseUrl
  }

  const normalizedOrigin = trimTrailingSlashes(browserOrigin || '')
  if (!normalizedOrigin) {
    return ''
  }

  if (isLocalViteOrigin(normalizedOrigin)) {
    return 'http://127.0.0.1:1933'
  }

  return normalizedOrigin
}

export function resolveStoredBaseUrl({
  browserOrigin,
  defaultBaseUrl,
  storedBaseUrl,
}: {
  browserOrigin?: string
  defaultBaseUrl: string
  storedBaseUrl?: string
}): string {
  const normalizedStoredBaseUrl = trimTrailingSlashes(storedBaseUrl || '')
  if (!normalizedStoredBaseUrl) {
    return defaultBaseUrl
  }

  const normalizedOrigin = trimTrailingSlashes(browserOrigin || '')
  if (
    normalizedOrigin &&
    normalizedStoredBaseUrl === normalizedOrigin &&
    defaultBaseUrl !== normalizedOrigin &&
    isLocalViteOrigin(normalizedOrigin)
  ) {
    return defaultBaseUrl
  }

  return normalizedStoredBaseUrl
}
