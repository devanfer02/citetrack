import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { AccentInk, Marker } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import {
  Arrow,
  DottedArc,
  Lightbulb,
  PaperPlane,
  Sparkles,
  Squiggle,
  StarBurst,
  Underline,
} from '#/components/doodles'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/')({
  component: HomePage,
  head: () => ({
    meta: [
      { title: 'CiteTrack — Periksa skripsimu sebelum dosen pembimbing' },
      {
        name: 'description',
        content:
          'Lacak setiap sitasi sampai halaman dan kalimatnya di paper sumber, dan periksa ejaan KBBI + EYD di seluruh draf.',
      },
      {
        property: 'og:title',
        content: 'CiteTrack — Periksa skripsimu sebelum dosen pembimbing',
      },
      {
        property: 'og:description',
        content:
          'Lacak setiap sitasi sampai halaman dan kalimatnya di paper sumber, dan periksa ejaan KBBI + EYD di seluruh draf.',
      },
    ],
  }),
})

const TRACE_FEATURES = [
  {
    title: 'Unggah & ekstrak',
    desc: 'Lepas berkas skripsimu. Setiap halaman diekstrak otomatis sebelum diperiksa.',
    tone: 'butter' as const,
  },
  {
    title: 'Urai & cocokkan',
    desc: 'Sitasi dalam teks dideteksi, dicocokkan ke Daftar Pustaka, lalu sumber PDF-nya diambil.',
    tone: 'mint' as const,
  },
  {
    title: 'Telusuri & verifikasi',
    desc: 'Pencarian lintas-bahasa menunjukkan halaman dan kalimat persis di paper sumber.',
    tone: 'sky' as const,
  },
] as const

const EVAL_FEATURES = [
  {
    title: 'KBBI',
    desc: 'Kata yang tidak terdaftar di Kamus Besar Bahasa Indonesia ditandai, lengkap dengan saran perbaikan.',
    tone: 'butter' as const,
  },
  {
    title: 'EYD',
    desc: 'Penulisan ejaan, huruf kapital, dan bentuk kata diperiksa terhadap Ejaan Yang Disempurnakan terbaru.',
    tone: 'blush' as const,
  },
] as const

function HomePage() {
  return (
    <main className="flex-1">
      {/* Hero band — butter yellow */}
      <Section tone="butter" grid innerClassName="relative pb-20 pt-16 sm:pb-24 sm:pt-20">
        <DottedArc
          tone="coral"
          size={120}
          className="absolute right-[8%] top-10 hidden lg:block"
        />
        <PaperPlane
          tone="coral"
          size={36}
          className="absolute right-[6%] top-6 rotate-[-15deg] hidden lg:block"
        />
        <Squiggle
          tone="indigo"
          size={64}
          className="absolute bottom-10 left-[6%] hidden md:block"
        />
        <Sparkles
          tone="coral"
          size={32}
          className="absolute right-[24%] bottom-16 hidden md:block"
        />

        <div className="grid items-end gap-x-12 gap-y-10 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent-coral-deep)]">
              <StarBurst tone="coral" size={14} />
              Untuk skripsi Indonesia
            </span>
            <h1 className="display-title mt-6 max-w-[18ch] text-[clamp(2.75rem,6vw,5rem)] font-extrabold leading-[0.95] tracking-[-0.02em] text-[var(--ink)]">
              Periksa skripsimu{' '}
              <AccentInk>sebelum</AccentInk>{' '}
              dosen pembimbing.
            </h1>
            <p className="mt-6 max-w-[44ch] text-[1.0625rem] leading-relaxed text-[var(--ink-soft)]">
              Lacak setiap sitasi sampai halaman dan kalimat di paper aslinya.
              Periksa ejaan dan EYD di seluruh draf — tanpa perlu menunggu
              revisi dari dosen.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/track">Mulai lacak sitasi</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/evaluation">Periksa tulisan</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div
              className="soft-card relative mx-auto max-w-md p-7 border-[var(--ink)]/85! shadow-[5px_5px_0_0_var(--ink)]!"
              data-tone="mint"
            >
              <span className="kicker text-[var(--accent-coral-deep)]">
                Apa kata CiteTrack?
              </span>
              <p className="mt-3 display-title text-2xl leading-snug text-[var(--ink)]">
                <Marker tone="yellow">3 sitasi</Marker> tidak ada di
                Daftar Pustaka.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                Setiap temuan tertaut langsung ke halaman dan kalimatnya di
                naskahmu.
              </p>
              <Arrow
                tone="coral"
                size={48}
                className="absolute -bottom-4 -right-4 rotate-[10deg]"
              />
            </div>
          </div>
        </div>
      </Section>

      {/* Citation tracer features — mint */}
      <Section
        tone="mint"
        grid
        className="[content-visibility:auto] [contain-intrinsic-size:auto_60rem]"
        innerClassName="pb-16 pt-16"
      >
        <div className="grid items-end gap-x-12 gap-y-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <span className="kicker text-[var(--accent-coral-deep)]">
              Citation Tracer
            </span>
            <h2 className="display-title mt-3 max-w-[20ch] text-[clamp(2rem,3.6vw,3rem)] font-extrabold leading-[1.02] tracking-tight text-[var(--ink)]">
              Setiap sitasi, sampai{' '}
              <Marker tone="yellow">ke kalimatnya</Marker>.
            </h2>
          </div>
          <div className="lg:pb-2">
            <p className="max-w-[40ch] text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
              Sitasi yang asal-tulis sering jadi catatan merah pertama.
              CiteTrack mengurutkan sitasi, mencocokkannya ke Daftar Pustaka,
              lalu mencari halaman dan kalimat persisnya di paper sumber.
            </p>
            <Button asChild className="mt-5">
              <Link to="/track">
                Coba lacak skripsimu
                <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {TRACE_FEATURES.map((f, i) => (
            <FeatureCard key={f.title} index={i} {...f} />
          ))}
        </div>
      </Section>

      {/* Evaluation features — cream */}
      <Section
        tone="cream"
        grid
        className="[content-visibility:auto] [contain-intrinsic-size:auto_60rem]"
        innerClassName="pb-16 pt-16 relative"
      >
        <Lightbulb
          tone="yellow"
          size={48}
          className="absolute right-[8%] top-10 hidden md:block"
        />
        <div className="grid items-end gap-x-12 gap-y-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="lg:pb-2">
            <p className="max-w-[40ch] text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
              Periksa skripsi terhadap Kamus Besar Bahasa Indonesia dan aturan
              ejaan yang disempurnakan. Setiap temuan dijelaskan dan ditautkan
              ke halaman tempat ia muncul di naskahmu.
            </p>
            <Button asChild className="mt-5" variant="secondary">
              <Link to="/evaluation">
                Periksa naskah
                <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            </Button>
          </div>
          <div className="min-w-0 lg:order-first">
            <span className="kicker text-[var(--accent-coral-deep)]">
              Evaluation
            </span>
            <h2 className="display-title mt-3 max-w-[20ch] text-[clamp(2rem,3.6vw,3rem)] font-extrabold leading-[1.02] tracking-tight text-[var(--ink)]">
              <AccentInk tone="indigo">Bersih</AccentInk> sebelum
              diserahkan.
            </h2>
          </div>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {EVAL_FEATURES.map((f, i) => (
            <FeatureCard key={f.title} index={i} {...f} />
          ))}
        </div>
      </Section>

      {/* Closing CTA — sky */}
      <Section
        tone="sky"
        grid
        className="[content-visibility:auto] [contain-intrinsic-size:auto_50rem]"
        innerClassName="relative pb-20 pt-16 text-center"
      >
        <Underline
          tone="coral"
          size={140}
          className="mx-auto block opacity-70"
        />
        <h2 className="display-title mx-auto mt-6 max-w-[22ch] text-[clamp(2rem,3.6vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          Siap menyerahkan draf yang{' '}
          <Marker tone="green">rapi</Marker>?
        </h2>
        <p className="mx-auto mt-4 max-w-[44ch] text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Unggah skripsimu sekali, dapatkan dua laporan: jejak sitasi dan
          pemeriksaan bahasa. Tanpa akun, tanpa kuota, tanpa repot.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/track">Mulai lacak</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/evaluation">Periksa tulisan</Link>
          </Button>
        </div>
      </Section>
    </main>
  )
}

interface FeatureCardProps {
  title: string
  desc: string
  index: number
  tone: 'butter' | 'mint' | 'blush' | 'sky'
}

function FeatureCard({ title, desc, index, tone }: FeatureCardProps) {
  return (
    <article
      className="soft-card group relative flex flex-col gap-3 p-6 border-[var(--ink)]/85! shadow-[5px_5px_0_0_var(--ink)]! transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[7px_7px_0_0_var(--ink)]!"
      data-tone={tone}
    >
      <Underline
        tone="coral"
        size={80}
        className="absolute -top-2 left-5 opacity-60"
      />
      <span className="kicker tabular-nums text-[var(--ink-soft)]">
        №{String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="display-title text-xl font-extrabold leading-snug text-[var(--ink)]">
        {title}
      </h3>
      <p className="text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        {desc}
      </p>
    </article>
  )
}
