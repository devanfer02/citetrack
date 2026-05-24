import { Link } from '@tanstack/react-router'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { PaperPlane } from '#/components/doodles'
import { Button } from '#/components/ui/button'

export function EvaluationErrorView({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  const isNotFound =
    /not found|tidak ditemukan|data is undefined/i.test(message)

  const title = isNotFound
    ? 'Laporan ini tidak ditemukan'
    : 'Tidak bisa membuka laporan'
  const lede = isNotFound
    ? 'Tautan yang kamu buka mungkin sudah kedaluwarsa, atau laporannya sudah dihapus. Coba buka kembali dari halaman Riwayat untuk daftar laporan yang tersedia.'
    : 'Ada yang tidak beres saat mengambil laporan ini. Coba muat ulang halaman; kalau masih sama, lihat detail di bawah atau kembali ke Riwayat.'

  return (
    <main className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-12 sm:px-10 sm:py-16">
      <header className="relative mb-10">
        <span className="kicker text-[var(--accent-coral-deep)]">
          Penilaian Skripsi
        </span>
        <h1 className="display-title mt-3 text-[clamp(2.25rem,3.6vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          {lede}
        </p>
        <div className="editorial-rule mt-6" />
        <PaperPlane
          className="pointer-events-none absolute right-0 top-2 hidden h-16 w-16 text-[var(--accent-coral)] opacity-70 sm:block"
          aria-hidden
        />
      </header>

      <section className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild type="button" variant="default" size="sm">
              <Link to="/history">
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                Lihat Riwayat
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
              Muat ulang halaman
            </Button>
          </div>

          <p className="max-w-2xl text-[0.875rem] leading-relaxed text-[var(--ink-soft)]">
            {isNotFound
              ? 'Kalau kamu yakin laporan ini seharusnya ada, kemungkinan basis data baru saja di-reset (mis. setelah deploy ulang). Unggah ulang naskahmu dari halaman Penilaian untuk memulai analisis dari awal.'
              : 'Pesan ini biasanya muncul saat koneksi ke server terputus atau saat layanan sedang restart. Tunggu beberapa detik lalu coba lagi.'}
          </p>
        </div>

        <aside
          className="soft-card relative overflow-hidden p-5"
          data-tone="blush"
          aria-live="polite"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="kicker text-[var(--ink-faint)]">
              Detail teknis
            </span>
            <span className="severity-badge" data-severity="error">
              Error
            </span>
          </div>
          <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.75rem] leading-relaxed text-[var(--ink-soft)]">
            {message}
          </pre>
        </aside>
      </section>
    </main>
  )
}
