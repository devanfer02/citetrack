import { createFileRoute, Link } from '@tanstack/react-router'
import { FileText, Search, MapPin } from 'lucide-react'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,oklch(0.7_0.15_180/0.32),transparent_66%)]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,oklch(0.45_0.1_160/0.18),transparent_66%)]" />
        <p className="island-kicker mb-3">Citation Tracer</p>
        <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-foreground sm:text-6xl">
          Trace every citation back to its source.
        </h1>
        <p className="mb-8 max-w-2xl text-base text-muted-foreground sm:text-lg">
          Upload your thesis PDF and get a complete map showing exactly which
          page and passage from each source paper you cited — even across
          languages.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/upload">Get Started →</Link>
          </Button>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: FileText,
            title: 'Upload & Extract',
            desc: 'Drop your thesis PDF — we extract text from every page automatically.',
          },
          {
            icon: Search,
            title: 'Parse & Match',
            desc: 'Detect in-text citations, match them to your reference list, and fetch source PDFs.',
          },
          {
            icon: MapPin,
            title: 'Trace & Verify',
            desc: 'Cross-language AI pinpoints the exact page and passage in each source paper.',
          },
        ].map(({ icon: Icon, title, desc }, index) => (
          <article
            key={title}
            className="island-shell feature-card rise-in rounded-2xl p-5"
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <Icon
              className="mb-3 h-6 w-6 text-primary"
              strokeWidth={1.5}
            />
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="m-0 text-sm text-muted-foreground">{desc}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
