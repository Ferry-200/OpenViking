export type ServerMode = 'checking' | 'dev-implicit' | 'explicit-auth' | 'offline'

export type ServerModeBadge = {
  labelKey: string
  variant: 'default' | 'secondary' | 'outline' | 'destructive'
}

function fixCommonHostTypos(baseUrl: string): string {
  try {
    const url = new URL(baseUrl)
    if (url.hostname.endsWith('.ap')) {
      url.hostname = `${url.hostname}p`
      return url.toString().replace(/\/+$/, '')
    }
  } catch {
    // Ignore invalid URLs and fall back to the normalized raw value.
  }

  return baseUrl
}

export function normalizeBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return fixCommonHostTypos(normalized)
}

export async function detectServerMode(baseUrl: string): Promise<ServerMode> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  if (!normalizedBaseUrl) {
    return 'offline'
  }

  try {
    const response = await fetch(`${normalizedBaseUrl}/health`, {
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return 'offline'
    }

    const data = await response.json() as { user_id?: string }
    return typeof data.user_id === 'string' && data.user_id.length > 0
      ? 'dev-implicit'
      : 'explicit-auth'
  } catch {
    return 'offline'
  }
}

export function describeServerMode(serverMode: ServerMode): ServerModeBadge {
  switch (serverMode) {
    case 'dev-implicit':
      return { labelKey: 'serverMode.devImplicit', variant: 'secondary' }
    case 'explicit-auth':
      return { labelKey: 'serverMode.explicitAuth', variant: 'outline' }
    case 'offline':
      return { labelKey: 'serverMode.offline', variant: 'destructive' }
    default:
      return { labelKey: 'serverMode.checking', variant: 'outline' }
  }
}
