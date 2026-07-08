import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import { Section } from '#/components/Section'
import { ConfigCard } from '#/components/settings/config-cards'
import { KbbiSourcesCard } from '#/components/settings/kbbi-sources-card'
import { configurationsQueryOptions } from '#/components/settings/shared'
import { isLocalEnv } from '#/env'
import type { ConfigKey } from '#/lib/configurations'

interface AdminSettingsPanelProps {
  /** Heading for the panel, e.g. "Setelan pencarian otomatis". */
  title: string
  /** Optional intro copy below the heading. */
  description?: ReactNode
  /** Config codes to surface, in display order. `kbbi.source.*` codes collapse
   * into one combined KbbiSourcesCard rendered after the individual cards. */
  codes: readonly ConfigKey[]
  /** Section background tone. Defaults to cream. */
  tone?: 'cream' | 'butter' | 'mint' | 'blush' | 'sky'
  /** Anchor id for the section, so a "Setelan" pill can jump to it. */
  id?: string
}

// Admin-only configuration block embedded on a feature page. Renders nothing
// for public visitors (gated on isLocalEnv) and never fires the configurations
// query in public mode. Lays the per-config cards out in a 2-col grid; KBBI
// source toggles collapse into the shared combined card.
export function AdminSettingsPanel({
  title,
  description,
  codes,
  tone = 'cream',
  id,
}: AdminSettingsPanelProps) {
  const { data } = useQuery({
    ...configurationsQueryOptions,
    staleTime: 30_000,
    enabled: isLocalEnv,
  })

  if (!isLocalEnv || !data) return null

  const codeOrder = new Map(codes.map((code, i) => [code, i]))
  const rows = data.filter((row) => codeOrder.has(row.code))
  if (rows.length === 0) return null

  const sourceRows = rows.filter((row) => row.code.startsWith('kbbi.source.'))
  const individualRows = rows
    .filter((row) => !row.code.startsWith('kbbi.source.'))
    .toSorted(
      (a, b) =>
        (codeOrder.get(a.code) ?? 0) - (codeOrder.get(b.code) ?? 0),
    )

  return (
    <Section
      id={id}
      tone={tone}
      className="scroll-mt-24"
      innerClassName="pb-16 pt-12"
    >
      <div className="mx-auto w-full max-w-[80rem]">
        <header className="mb-8 flex flex-col gap-2 border-b border-[var(--line)] pb-4">
          <span className="kicker inline-flex items-center gap-1.5 text-[var(--accent-indigo-deep)]">
            <SlidersHorizontal className="size-3.5" strokeWidth={1.75} />
            admin · setelan
          </span>
          <h2 className="display-title text-[1.75rem] font-extrabold leading-tight text-[var(--ink)]">
            {title}
          </h2>
          {description && (
            <p className="max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
              {description}
            </p>
          )}
          <p className="text-[0.8125rem] leading-relaxed text-[var(--ink-faint)]">
            Hanya tampil saat CiteTrack jalan lokal. Setelan global lain ada di{' '}
            <Link
              to="/settings"
              className="underline underline-offset-2 hover:text-[var(--ink)]"
            >
              halaman Setelan
            </Link>
            .
          </p>
        </header>

        {individualRows.length > 0 && (
          <div className="grid items-stretch gap-6 md:grid-cols-2">
            {individualRows.map((row, idx) => (
              <ConfigCard key={row.code} row={row} idx={idx} />
            ))}
          </div>
        )}

        {sourceRows.length > 0 && (
          <div className="mt-6">
            <KbbiSourcesCard rows={sourceRows} />
          </div>
        )}
      </div>
    </Section>
  )
}
