import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { VikingFileManager } from './-components/viking-file-manager'

type ResourcesSearch = {
  uri?: string
  q?: string
  file?: string
}

export const Route = createFileRoute('/resources')({
  validateSearch: (search: Record<string, unknown>): ResourcesSearch => ({
    uri: typeof search.uri === 'string' ? search.uri : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
  component: ResourcesRoute,
})

function ResourcesRoute() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <VikingFileManager
      initialUri={search.uri}
      initialQuery={search.q}
      initialFile={search.file}
      onUriChange={(uri) => {
        navigate({
          search: (prev) => ({ ...prev, uri }),
          replace: true,
        })
      }}
      onQueryChange={(q) => {
        navigate({
          search: (prev) => ({ ...prev, q: q || undefined }),
          replace: true,
        })
      }}
    />
  )
}
