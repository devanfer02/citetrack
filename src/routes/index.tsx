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
          'Periksa ejaan KBBI dan aturan EYD di seluruh draf skripsimu, lalu lacak tiap sitasi sampai ke halaman dan kalimatnya di paper sumber.',
      },
      {
        property: 'og:title',
        content: 'CiteTrack — Periksa skripsimu sebelum dosen pembimbing',
      },
      {
        property: 'og:description',
        content:
          'Periksa ejaan KBBI dan aturan EYD di seluruh draf skripsimu, lalu lacak tiap sitasi sampai ke halaman dan kalimatnya di paper sumber.',
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
    desc: 'Sitasi dalam teks dicocokkan ke Daftar Pustaka, lalu PDF sumbernya diambil otomatis.',
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
    desc: 'Ejaan, huruf kapital, dan bentuk kata dicek terhadap aturan Ejaan Yang Disempurnakan.',
    tone: 'blush' as const,
  },
] as const

function HomePage() {
  return (
    <main id="main-content" className="flex-1">
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
              Cek ejaan tiap kata ke KBBI dan cocokkan tulisanmu dengan aturan
              EYD, sebelum dosen yang menemukannya duluan. Sitasi pun bisa kamu
              lacak sampai ke kalimat di paper sumbernya.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/evaluation">Periksa tulisan</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/track">Lacak sitasi</Link>
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
                Kamu menulis “analisa”. Maksudmu{' '}
                <Marker tone="yellow">analisis</Marker>, ya?
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                Tiap temuan kami jelaskan dan tautkan ke halaman tempatnya
                muncul di naskahmu.
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

      {/* Language evaluation — cream (lead feature) */}
      <Section
        tone="cream"
        grid
        className="[content-visibility:auto] [contain-intrinsic-size:auto_60rem]"
        innerClassName="relative pb-16 pt-16"
      >
        <Lightbulb
          tone="yellow"
          size={48}
          className="absolute right-[8%] top-10 hidden md:block"
        />
        <div className="grid items-end gap-x-12 gap-y-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <span className="kicker text-[var(--accent-coral-deep)]">
              Pemeriksaan
            </span>
            <h2 className="display-title mt-3 max-w-[20ch] text-[clamp(2rem,3.6vw,3rem)] font-extrabold leading-[1.02] tracking-tight text-[var(--ink)]">
              <AccentInk tone="indigo">Bersih</AccentInk> sebelum
              diserahkan.
            </h2>
          </div>
          <div className="lg:pb-2">
            <p className="max-w-[40ch] text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
              Tiap kata dicek ke Kamus Besar Bahasa Indonesia, tiap aturan EYD
              dicocokkan satu per satu. Yang janggal kami tandai, lengkap dengan
              alasannya dan halaman tempatnya muncul.
            </p>
            <Button asChild className="mt-5">
              <Link to="/evaluation">
                Periksa naskahmu
                <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {EVAL_FEATURES.map((f, i) => (
            <FeatureCard key={f.title} index={i} {...f} />
          ))}
        </div>
      </Section>

      {/* Citation tracer — mint (secondary feature) */}
      <Section
        tone="mint"
        grid
        className="[content-visibility:auto] [contain-intrinsic-size:auto_60rem]"
        innerClassName="pb-16 pt-16"
      >
        <div className="grid items-end gap-x-12 gap-y-6 lg:grid-cols-[1.1fr_1fr]">
          <div className="min-w-0">
            <span className="kicker text-[var(--accent-coral-deep)]">
              Pelacak sitasi
            </span>
            <h2 className="display-title mt-3 max-w-[20ch] text-[clamp(2rem,3.6vw,3rem)] font-extrabold leading-[1.02] tracking-tight text-[var(--ink)]">
              Setiap sitasi, sampai{' '}
              <Marker tone="yellow">ke kalimatnya</Marker>.
            </h2>
          </div>
          <div className="lg:pb-2">
            <p className="max-w-[40ch] text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
              Sitasi dalam teks dicocokkan ke Daftar Pustaka, lalu halaman dan
              kalimat asalnya dicari di paper sumber. Kalau ada yang tak ketemu,
              kamu lihat semuanya di laporan.
            </p>
            <Button asChild className="mt-5" variant="secondary">
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
          Unggah skripsimu sekali, dapat dua laporan: pemeriksaan bahasa dan
          jejak sitasi. Gratis, tanpa perlu bikin akun.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/evaluation">Mulai periksa</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/track">Lacak sitasi</Link>
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
