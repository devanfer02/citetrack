import { Link } from '@tanstack/react-router'

const FACES = [
  '(・_・?)',
  '(・・ ) ?',
  '(￣ω￣;)',
  '( •᷄ɞ•᷅ )',
  '(◎_◎;)',
] as const

function pickFace(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  return FACES[Math.abs(hash) % FACES.length]
}

export default function NotFoundPage() {
  const face =
    typeof window === 'undefined'
      ? FACES[0]
      : pickFace(window.location.pathname || '404')

  return (
    <main id="main-content" className="page-wrap flex min-h-[60vh] flex-col items-center justify-center gap-8 py-16 text-center">
      <div
        aria-hidden
        className="select-none font-mono text-5xl leading-none text-[var(--sea-ink-soft)] sm:text-6xl"
      >
        {face}
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="island-kicker">404</p>
        <h1 className="display-title m-0 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Halaman atau laporan ini tidak ada
        </h1>
        <p className="m-0 max-w-prose text-pretty text-muted-foreground">
          Tautan yang kamu buka mungkin sudah kedaluwarsa, salah ketik, atau
          laporannya memang belum pernah dibuat. Coba balik ke beranda dan buka
          ulang dari sana.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(61,194,236,0.28)] no-underline transition-colors hover:bg-[var(--lagoon-deep)]"
        >
          Kembali ke beranda
        </Link>
      </div>
    </main>
  )
}
