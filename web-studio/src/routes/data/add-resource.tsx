import { createFileRoute } from '@tanstack/react-router'

import { AddResourcePage } from '#/components/data/add-resource-page'

export const Route = createFileRoute('/data/add-resource')({
  component: AddResourcePage,
})
