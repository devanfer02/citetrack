import { z } from 'zod'

export const settingsTabSchema = z.enum([
  'autofetch',
  'upload',
  'purge',
  'kbbi',
  'passage',
])
export type SettingsTab = z.infer<typeof settingsTabSchema>

export const settingsSearchSchema = z.object({
  tab: settingsTabSchema.optional().default('autofetch'),
})
export type SettingsSearch = z.infer<typeof settingsSearchSchema>
