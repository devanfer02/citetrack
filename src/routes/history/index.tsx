import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { ArrowUpRight } from 'lucide-react'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import {
  Arrow,
  DottedArc,
  PaperPlane,
  Sparkles,
  Squiggle,
  StarBurst,
  Underline,
} from '#/components/doodles'
import { isLocalEnv } from '#/env'
import { getHistoryPage, type HistoryPage } from '#/services/history'
import { historySearchSchema } from '#/schemas/history'
import { HistoryRow } from './-sections/history-row'
import { HistoryTabs } from './-sections/history-tabs'
import { HistoryPagination } from './-sections/history-pagination'

export const Route = createFileRoute('/history/')({
  beforeLoad: () => {
    if (!isLocalEnv) throw notFound()
  },
  component: HistoryRoute,
  validateSearch: zodValidator(historySearchSchema),
  loaderDeps: ({ search: { kind, page } }) => ({ kind, page }),
  loader: ({ deps: { kind, page } }) =>
    getHistoryPage({ data: { kind, page } }),
})

function HistoryRoute() {
  const data = Route.useLoaderData() as HistoryPage
  const { kind } = Route.useSearch()

  return (
    <main className="flex-1">
      <Section tone="sky" grid innerClassName="relative pb-10 pt-14">
        <Sparkles
          tone="indigo"
          size={42}
          className="absolute right-[8%] top-10 hidden md:block"
        />
        <DottedArc
          tone="coral"
          size={120}
          className="absolute right-[12%] top-[7rem] hidden lg:block"
        />
        <PaperPlane
          tone="coral"
          size={32}
          className="absolute right-[6%] top-[10rem] rotate-[18deg] hidden lg:block"
        />
        <Squiggle
          tone="indigo"
          size={56}
          className="absolute left-[6%] bottom-8 hidden md:block"
        />
        <StarBurst
          tone="indigo"
          size={20}
          className="absolute left-[18%] top-12 hidden md:block"
        />
        <Arrow
          tone="coral"
          size={48}
          className="absolute right-[26%] bottom-10 -rotate-[10deg] hidden lg:block"
        />

        <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-indigo-deep)]">
          <StarBurst tone="indigo" size={14} />
          Riwayat
        </span>
        <h1 className="display-title mt-4 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          Yang sudah kamu <Marker tone="green">kerjakan</Marker>.
        </h1>
        <p className="mt-4 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Naskah yang baru diunggah,{' '}
          <AccentInk tone="indigo">paling baru di paling atas</AccentInk>.
          Klik salah satunya untuk membuka kembali.
        </p>
        <Underline
          tone="coral"
          size={140}
          className="mt-3 block opacity-60"
        />
      </Section>

      <div className="mx-auto w-full max-w-5xl px-6 pb-16 pt-10 sm:px-8">
      <HistoryTabs active={kind} />

      {data.items.length === 0 ? (
        <EmptyState kind={kind} />
      ) : (
        <>
          <ol className="flex flex-col">
            {data.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <HistoryRow item={item} />
              </li>
            ))}
          </ol>
          <HistoryPagination
            kind={kind}
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            shown={data.items.length}
          />
        </>
      )}
      </div>
    </main>
  )
}

function EmptyState({ kind }: { kind: HistoryKind }) {
  const targetHref = kind === 'track' ? '/track' : '/evaluation'
  const targetLabel = kind === 'track' ? 'Citation Tracer' : 'Evaluation'
  return (
    <aside className="grid grid-cols-[3.5rem_1fr] gap-x-5 py-10">
      <span
        aria-hidden
        className="marginalia-rule mt-1 h-[calc(100%-0.5rem)] w-px justify-self-end"
        data-severity="info"
      />
      <div>
        <p className="island-kicker text-[var(--sea-ink-soft)]">
          Belum ada riwayat
        </p>
        <h2 className="mt-1 display-title text-xl font-medium leading-snug text-foreground sm:text-2xl">
          Belum ada {targetLabel} di sini.
        </h2>
        <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
          Unggah skripsi di halaman {targetLabel} untuk menyimpan jejaknya di
          riwayat.
        </p>
        <Link
          to={targetHref}
          className="group mt-5 inline-flex items-baseline gap-1.5 border-b border-[var(--sea-ink)] pb-1 text-[0.9375rem] font-medium text-[var(--sea-ink)] transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
        >
          Buka {targetLabel}
          <ArrowUpRight
            className="h-4 w-4 translate-y-px transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
            strokeWidth={1.5}
          />
        </Link>
      </div>
    </aside>
  )
}
