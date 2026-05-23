import { createFileRoute, Link } from '@tanstack/react-router'
import {
  BookOpen,
  FileCheck,
  FileText,
  MapPin,
  Search,
  SpellCheck,
} from 'lucide-react'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/')({ component: HomePage })

const TRACE_FEATURES = [
  {
    icon: FileText,
    title: 'Upload & Extract',
    desc: 'Drop your thesis PDF. We extract text from every page automatically.',
  },
  {
    icon: Search,
    title: 'Parse & Match',
    desc: 'Detect in-text citations, match them to your Daftar Pustaka, and fetch source PDFs.',
  },
  {
    icon: MapPin,
    title: 'Trace & Verify',
    desc: 'Cross-language AI pinpoints the exact page and passage in each source paper.',
  },
] as const

const EVAL_FEATURES = [
  {
    icon: SpellCheck,
    title: 'KBBI Spelling',
    desc: "Flag words that aren't in the official Indonesian dictionary, with suggested corrections.",
  },
  {
    icon: BookOpen,
    title: 'EYD Orthography',
    desc: 'Check capitalization, punctuation, and word forms against the current EYD rules.',
  },
  {
    icon: FileCheck,
    title: 'FILKOM Template',
    desc: 'Verify sections, headings, and structure against the FILKOM skripsi template.',
  },
] as const

function HomePage() {
  return (
    <main className="w-full flex-1 px-4 pb-12 pt-10">
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

        <div className="relative z-10 max-w-2xl">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            For FILKOM Skripsi
          </p>
          <h1 className="display-title mb-6 text-4xl leading-[1.05] font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Check your skripsi before your advisor does.
          </h1>
          <p className="mb-10 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            Trace every citation back to its source, down to the exact page
            and passage. Check your writing against KBBI, EYD, and the FILKOM
            template.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link to="/track" className="!text-primary-foreground no-underline">
                Trace citations →
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/30 bg-white/5 text-white hover:bg-white/10"
            >
              <Link to="/evaluation" className="!text-white no-underline">
                Evaluate writing →
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Citation Tracer */}
      <section className="cv-auto mx-auto mt-12 max-w-6xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Citation Tracer
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {TRACE_FEATURES.map(({ icon: Icon, title, desc }, index) => (
            <article
              key={title}
              className="island-shell feature-card rise-in rounded-2xl p-6"
              style={{ animationDelay: `${index * 90 + 80}ms` }}
            >
              <Icon className="mb-3 h-6 w-6 text-primary" strokeWidth={1.5} />
              <h2 className="mb-2 text-base font-semibold text-foreground">
                {title}
              </h2>
              <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Evaluation */}
      <section className="cv-auto mx-auto mt-10 max-w-6xl">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Evaluation
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {EVAL_FEATURES.map(({ icon: Icon, title, desc }, index) => (
            <article
              key={title}
              className="island-shell feature-card rise-in rounded-2xl p-6"
              style={{ animationDelay: `${index * 90 + 80}ms` }}
            >
              <Icon className="mb-3 h-6 w-6 text-primary" strokeWidth={1.5} />
              <h2 className="mb-2 text-base font-semibold text-foreground">
                {title}
              </h2>
              <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
