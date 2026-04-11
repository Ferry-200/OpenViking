import { createFileRoute } from '@tanstack/react-router'

import { VikingBotPage } from '#/components/bot/vikingbot-page'

export const Route = createFileRoute('/bot/vikingbot')({
  component: VikingBotPage,
})
