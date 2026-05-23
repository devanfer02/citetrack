import { createFileRoute, Link } from '@tanstack/react-router'
import { FileText, Search, MapPin } from 'lucide-react'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return (
    <main className="px-4 pb-12 pt-10">
      {/* Hero */}
      <section className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--sea-ink)] via-[#0f4d62] to-[#0a3340] px-8 py-16 sm:px-14 sm:py-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 -top-16 h-72 w-72 rounded-full bg-[radial-gradient(circle,oklch(0.65_0.12_195/0.25),transparent_65%)]" />
          <div className="absolute -bottom-20 -right-12 h-80 w-80 rounded-full bg-[radial-gradient(circle,oklch(0.55_0.14_165/0.2),transparent_60%)]" />

          <div className="absolute left-[5%] top-1/2 -translate-y-1/2 font-mono text-[8rem] leading-none font-extralight text-white/[0.04] select-none">
            [
          </div>
          <div className="absolute right-[5%] top-1/2 -translate-y-1/2 font-mono text-[8rem] leading-none font-extralight text-white/[0.04] select-none">
            ]
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-2xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Citation Tracer
          </p>
          <h1 className="display-title mb-6 text-4xl leading-[1.05] font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Trace every citation back to its source.
          </h1>
          <p className="mb-10 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Upload your thesis PDF and get a complete map showing exactly which
            page and passage from each source paper you cited — even across
            languages.
          </p>
          <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to="/upload" className="!text-primary-foreground no-underline">
              Get Started →
            </Link>
          </Button>
        </div>
      </section>

      <section className="cv-auto mx-auto mt-10 grid max-w-6xl gap-4 sm:grid-cols-3">
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
            className="island-shell feature-card rise-in rounded-2xl p-6"
            style={{ animationDelay: `${index * 90 + 80}ms` }}
          >
            <Icon
              className="mb-3 h-6 w-6 text-primary"
              strokeWidth={1.5}
            />
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="m-0 text-sm leading-relaxed text-muted-foreground">{desc}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
