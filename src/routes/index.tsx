import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

export const Route = createFileRoute('/')({ component: HomePage })

const TRACE_FEATURES = [
  {
    title: 'Unggah & ekstrak',
    desc: 'Lepas berkas skripsi-mu. Setiap halaman diekstrak otomatis sebelum diperiksa.',
  },
  {
    title: 'Urai & cocokkan',
    desc: 'Sitasi dalam teks dideteksi, dicocokkan ke Daftar Pustaka, lalu sumber PDF-nya diambil.',
  },
  {
    title: 'Telusuri & verifikasi',
    desc: 'Pencarian lintas-bahasa menunjukkan halaman dan kalimat persis di paper sumber.',
  },
] as const

const EVAL_FEATURES = [
  {
    title: 'KBBI',
    desc: 'Kata yang tidak terdaftar di Kamus Besar Bahasa Indonesia ditandai, lengkap dengan saran perbaikan.',
  },
  {
    title: 'EYD',
    desc: 'Penulisan ejaan, huruf kapital, dan bentuk kata diperiksa terhadap Ejaan Yang Disempurnakan terbaru.',
  },
] as const

function HomePage() {
  return (
    <main className="mx-auto w-full max-w-[80rem] flex-1 px-6 pb-20 pt-16 sm:px-10">
      <section
        aria-labelledby="masthead"
        className="grid gap-x-12 gap-y-10 lg:grid-cols-[1fr_minmax(0,24rem)] lg:items-end"
      >
        <div className="min-w-0">
          <p className="island-kicker mb-5 text-[var(--lagoon-deep)]">
            CiteTrack &nbsp;·&nbsp; Untuk Skripsi
          </p>
          <h1
            id="masthead"
            className="display-title max-w-[18ch] text-[clamp(2.5rem,5.5vw,4.75rem)] font-medium leading-[0.95] tracking-[-0.015em] text-[var(--sea-ink)]"
          >
            Periksa skripsimu{' '}
            <em className="font-medium italic text-[var(--lagoon-deep)]">
              sebelum
            </em>{' '}
            dosen pembimbing.
          </h1>
        </div>
        <aside className="lg:pb-2">
          <p className="max-w-[34ch] text-[1.0625rem] leading-relaxed text-[var(--sea-ink-soft)]">
            Lacak setiap sitasi sampai halaman dan kalimat di paper aslinya.
            Periksa ejaan dan EYD di seluruh draf — tanpa perlu menunggu
            revisi dari dosen.
          </p>
          <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            <Link
              to="/track"
              className="group inline-flex items-baseline gap-1.5 border-b border-[var(--sea-ink)] pb-1 text-[0.9375rem] font-medium text-[var(--sea-ink)] transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
            >
              Mulai melacak sitasi
              <ArrowUpRight
                className="h-4 w-4 translate-y-px transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
                strokeWidth={1.5}
              />
            </Link>
            <Link
              to="/evaluation"
              className="group inline-flex items-baseline gap-1.5 border-b border-transparent pb-1 text-[0.9375rem] text-[var(--sea-ink-soft)] transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
            >
              atau periksa tulisan
              <ArrowUpRight
                className="h-4 w-4 translate-y-px transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
                strokeWidth={1.5}
              />
            </Link>
          </div>
        </aside>
      </section>

      <div className="editorial-rule mt-16" />

      <Department
        kicker="Citation Tracer"
        anchor="track"
        title="Setiap sitasi, sampai ke kalimatnya."
        intro="Sitasi yang asal-tulis sering jadi catatan merah pertama. CiteTrack mengurutkan sitasi, mencocokkannya ke Daftar Pustaka, lalu mencari halaman dan kalimat persisnya di paper sumber."
        href="/track"
        cta="Coba lacak skripsimu"
        features={TRACE_FEATURES}
      />

      <Department
        kicker="Evaluation"
        anchor="eval"
        title="Bersih sebelum diserahkan."
        intro="Periksa skripsi terhadap Kamus Besar Bahasa Indonesia dan aturan ejaan yang disempurnakan. Setiap temuan dijelaskan dan ditautkan ke halaman tempat ia muncul."
        href="/evaluation"
        cta="Periksa naskah"
        features={EVAL_FEATURES}
      />
    </main>
  )
}

interface DepartmentProps {
  kicker: string
  anchor: string
  title: string
  intro: string
  href: '/track' | '/evaluation'
  cta: string
  features: readonly { title: string; desc: string }[]
}

function Department({
  kicker,
  anchor,
  title,
  intro,
  href,
  cta,
  features,
}: DepartmentProps) {
  return (
    <section
      id={anchor}
      className="cv-auto mt-20 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,21rem)_1fr]"
    >
      <header className="lg:pt-2">
        <p className="island-kicker mb-3 text-[var(--lagoon-deep)]">{kicker}</p>
        <h2 className="display-title text-[clamp(1.875rem,3vw,2.5rem)] font-medium leading-[1.05] tracking-tight text-[var(--sea-ink)]">
          {title}
        </h2>
        <p className="mt-4 max-w-[34ch] text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
          {intro}
        </p>
        <Link
          to={href}
          className="group mt-5 inline-flex items-baseline gap-1.5 border-b border-[var(--sea-ink)] pb-1 text-sm font-medium text-[var(--sea-ink)] transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
        >
          {cta}
          <ArrowUpRight
            className="h-3.5 w-3.5 translate-y-px transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
            strokeWidth={1.75}
          />
        </Link>
      </header>

      <ol className="flex flex-col">
        {features.map((f, idx) => (
          <li
            key={f.title}
            className="grid grid-cols-[2.5rem_1fr] gap-x-5 border-t border-[var(--line)] py-5 first:border-t-0 first:pt-1 sm:grid-cols-[3.5rem_1fr]"
          >
            <span className="kicker tabular-nums text-[var(--sea-ink-soft)]/80">
              №{String(idx + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0">
              <h3 className="display-title text-xl font-medium leading-snug text-foreground sm:text-[1.375rem]">
                {f.title}
              </h3>
              <p className="mt-1.5 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--sea-ink-soft)]">
                {f.desc}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
