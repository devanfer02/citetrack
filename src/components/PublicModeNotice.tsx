import { CITETRACK_REPO_URL } from '#/lib/citetrack-links'
import { useIsLocalEnv } from '#/stores/preview-public-mode'

interface PublicModeNoticeProps {
  className?: string
}

export function PublicModeNotice({ className }: PublicModeNoticeProps) {
  const isLocalEnv = useIsLocalEnv()
  if (isLocalEnv) return null

  return (
    <aside
      className={`soft-card mb-6 px-5 py-4 ${className ?? ''}`}
      data-tone="blush"
      aria-label="Catatan demo publik"
    >
      <p className="display-title text-base font-semibold leading-snug text-[var(--ink)]">
        Ini demo publik
      </p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        Apa pun yang kamu unggah di sini bisa dibuka siapa saja yang punya
        tautannya, dan tidak bisa dihapus atas permintaan. Sapuan harian
        menghapus unggahan setelah sekitar 24 jam, tapi sebelum itu, anggap
        saja publik. Untuk skripsi yang sensitif, jalankan CiteTrack di
        komputermu sendiri.{' '}
        <a
          href={CITETRACK_REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-[var(--ink)] underline decoration-[var(--marker-blush)] decoration-2 underline-offset-2 hover:decoration-[var(--accent-coral)]"
        >
          Panduan di GitHub
        </a>
        .
      </p>
    </aside>
  )
}
