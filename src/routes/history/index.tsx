import { createFileRoute, Link } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { Clock } from 'lucide-react'
import { getHistoryPage, type HistoryPage } from '#/services/history'
import { historySearchSchema } from '#/schemas/history'
import { HistoryRow } from './-sections/history-row'
import { HistoryTabs } from './-sections/history-tabs'
import { HistoryPagination } from './-sections/history-pagination'

export const Route = createFileRoute('/history/')({
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
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-8 pt-8">
      <header className="mb-6">
        <p className="island-kicker mb-2">History</p>
        <h1 className="display-title text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          What you've worked on
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Recent thesis uploads, newest first.
        </p>
      </header>

      <HistoryTabs active={kind} />

      {data.items.length === 0 ? (
        <EmptyState kind={kind} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={`${item.kind}-${item.id}`}>
                <HistoryRow item={item} />
              </li>
            ))}
          </ul>
          <HistoryPagination
            kind={kind}
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            shown={data.items.length}
          />
        </>
      )}
    </main>
  )
}

function EmptyState({ kind }: { kind: HistoryKind }) {
  const targetHref = kind === 'track' ? '/track' : '/evaluation'
  const targetLabel = kind === 'track' ? 'Track' : 'Evaluation'
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--line)] px-6 py-12 text-center">
      <Clock className="h-8 w-8 text-muted-foreground" />
      <h2 className="text-base font-semibold">No {targetLabel} history yet</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Upload a thesis on{' '}
        <Link className="text-primary hover:underline" to={targetHref}>
          {targetLabel}
        </Link>{' '}
        to see it here.
      </p>
    </div>
  )
}
