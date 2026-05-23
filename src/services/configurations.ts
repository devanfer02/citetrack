import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { db } from '#/db'
import { configurations } from '#/db/schema'
import { assertLocalOnly } from '#/env'
import {
  CONFIG_DEFAULTS,
  CONFIG_DESCRIPTIONS,
  CONFIG_KEYS,
  CONFIG_LABELS,
  CONFIG_SCHEMAS,
  type ConfigKey,
  type ConfigValue,
} from '#/lib/configurations'
import { clearConfigCache } from '#/services/configurations-cache'

export type ConfigurationRow = {
  code: ConfigKey
  value: ConfigValue<ConfigKey>
  defaultValue: ConfigValue<ConfigKey>
  label: string
  description: string
  isDefault: boolean
  updatedAt: Date
}

export const listConfigurations = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ConfigurationRow[]> => {
    assertLocalOnly()
    const rows = await db
      .select({
        code: configurations.code,
        value: configurations.value,
        updatedAt: configurations.updatedAt,
      })
      .from(configurations)

    const byCode = new Map(rows.map((r) => [r.code, r]))
    const now = new Date()

    return CONFIG_KEYS.map((code) => {
      const stored = byCode.get(code)
      const schema = CONFIG_SCHEMAS[code]
      const parsed = stored ? schema.safeParse(stored.value) : null
      const effective = parsed?.success
        ? (parsed.data as ConfigValue<ConfigKey>)
        : (CONFIG_DEFAULTS[code] as ConfigValue<ConfigKey>)
      return {
        code,
        value: effective,
        defaultValue: CONFIG_DEFAULTS[code] as ConfigValue<ConfigKey>,
        label: CONFIG_LABELS[code],
        description: CONFIG_DESCRIPTIONS[code],
        isDefault: effective === CONFIG_DEFAULTS[code],
        updatedAt: stored?.updatedAt ?? now,
      }
    })
  },
)

const updateInputSchema = z.object({
  code: z.enum(CONFIG_KEYS as [ConfigKey, ...ConfigKey[]]),
  value: z.unknown(),
})

export const updateConfiguration = createServerFn({ method: 'POST' })
  .inputValidator(updateInputSchema)
  .handler(async ({ data: { code, value } }) => {
    assertLocalOnly()
    const schema = CONFIG_SCHEMAS[code]
    const parsed = schema.safeParse(value)
    if (!parsed.success) {
      throw new Error(
        `Invalid value for "${code}": ${parsed.error.issues.map((i) => i.message).join('; ')}`,
      )
    }
    await db
      .insert(configurations)
      .values({
        code,
        value: parsed.data,
        description: CONFIG_DESCRIPTIONS[code],
      })
      .onConflictDoUpdate({
        target: configurations.code,
        set: { value: parsed.data, description: CONFIG_DESCRIPTIONS[code] },
      })
    clearConfigCache()
    return { code, value: parsed.data }
  })
