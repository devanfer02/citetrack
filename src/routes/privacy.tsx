import { createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight, Github, Linkedin } from 'lucide-react'
import { AccentInk } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import {
  CITETRACK_REPO_URL,
  CITETRACK_REPO_ISSUES_URL,
  CREATOR_LINKEDIN_URL,
} from '#/lib/citetrack-links'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: 'Privacy Policy · CiteTrack' },
      {
        name: 'description',
        content:
          'How CiteTrack handles your thesis PDFs, extracted text, and related data.',
      },
    ],
  }),
})

function PrivacyPage() {
  return (
    <main className="flex-1">
      <Section tone="sky" innerClassName="pb-10 pt-14">
        <span className="kicker text-[var(--accent-indigo-deep)]">
          Legal · Privasi
        </span>
        <h1 className="display-title mt-3 text-[clamp(2.25rem,3.6vw,2.75rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          <AccentInk tone="indigo">Privacy</AccentInk> Policy
        </h1>
        <p className="kicker mt-4 text-[var(--ink-soft)]">
          Terakhir diperbarui · 26 Mei 2026
        </p>
      </Section>

      <article className="mx-auto w-full max-w-3xl px-6 pb-20 pt-10 sm:px-8">
        <div className="flex flex-col gap-10 text-[0.9375rem] leading-relaxed text-[var(--ink)]">
          <PolicySection title="Siapa kami">
            <p>
              CiteTrack adalah alat akademis. Kami buat untuk membantu
              mahasiswa melacak sitasi dan memeriksa tulisan skripsi.
              Proyek terbuka, bukan layanan komersial.
            </p>
          </PolicySection>

          <PolicySection title="Apa yang kami simpan">
            <ul className="list-none space-y-4 pl-0">
              <Bullet label="PDF yang diunggah">
                Naskah dan PDF sumber yang kamu unggah disimpan supaya
                pipeline pelacakan dan pemeriksaan bisa jalan, dan supaya
                kamu bisa membukanya lagi dari halaman riwayat.
              </Bullet>
              <Bullet label="Teks dan metadata">
                Sitasi, daftar pustaka, hasil pencocokan, dan kalimat yang
                ditelusuri disimpan di basis data kami, ditautkan ke ID
                pekerjaan di URL.
              </Bullet>
              <Bullet label="Data teknis minimal">
                Log permintaan standar (timestamp, jejak error) untuk
                mengoperasikan layanan. Tidak ada analytics atau pixel
                pelacakan.
              </Bullet>
            </ul>
          </PolicySection>

          <PolicySection title="Bagaimana kami menggunakannya">
            <p>
              Data hanya kami pakai untuk menjalankan pipeline yang kamu
              panggil: urai sitasi, urai daftar pustaka, pencocokan,
              pengambilan sumber, penelusuran kalimat, dan evaluasi
              EYD&nbsp;/&nbsp;KBBI. Hasilnya muncul di halaman kamu. Kami
              tidak menjual data, tidak memakainya untuk iklan, dan tidak
              melatih model machine-learning di atasnya.
            </p>
          </PolicySection>

          <PolicySection title="Layanan pihak ketiga">
            <p className="mb-4">
              Pipeline mengandalkan beberapa layanan pihak ketiga untuk
              mencari metadata sumber. Yang dikirim ke mereka hanya data
              minimum seperti DOI atau judul.
            </p>
            <ul className="list-none space-y-4 pl-0">
              <Bullet label="PDF tetap di server kami">
                Skripsi dan PDF referensi yang kamu unggah tidak pernah
                dikirim ke LLM atau API cloud. Penelusuran kalimat berjalan
                di server kami pakai exact-match dan BM25.
              </Bullet>
            </ul>
          </PolicySection>

          <PolicySection title="Retensi dan penghapusan">
            <p>
              Pekerjaan dan PDF terkait tetap tersimpan, jadi kamu bisa
              membukanya lagi dari halaman riwayat kapan saja. Kalau kamu
              ingin sebuah pekerjaan dihapus permanen, hubungi pemelihara
              dan sertakan ID pekerjaan dari URL.
            </p>
          </PolicySection>

          <PolicySection title="Kode sumber">
            <p className="mb-5">
              CiteTrack open source. Kamu bisa periksa keseluruhan
              implementasinya, termasuk bagaimana PDF di-parse, disimpan,
              dan dikirim ke layanan pihak ketiga, langsung di repositori:
            </p>
            <a
              href={CITETRACK_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-baseline gap-1.5 border-b border-[var(--sea-ink)] pb-1 text-[0.9375rem] font-medium text-[var(--sea-ink)] no-underline transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
            >
              <Github
                className="h-3.5 w-3.5 translate-y-px"
                strokeWidth={1.75}
              />
              {CITETRACK_REPO_URL.replace('https://', '')}
              <ArrowUpRight
                className="h-3.5 w-3.5 translate-y-px transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
                strokeWidth={1.5}
              />
            </a>
          </PolicySection>

          <PolicySection title="Kontak">
            <p className="mb-5">
              Pertanyaan, permintaan penghapusan, atau laporan keamanan: buka
              issue di{' '}
              <a
                href={CITETRACK_REPO_ISSUES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--lagoon-deep)] underline decoration-[var(--lagoon)]/40 decoration-1 underline-offset-[3px] hover:decoration-[var(--lagoon-deep)]"
              >
                repo GitHub
              </a>
              , atau hubungi pemeliharanya langsung:
            </p>
            <a
              href={CREATOR_LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-baseline gap-1.5 border-b border-[var(--sea-ink)] pb-1 text-[0.9375rem] font-medium text-[var(--sea-ink)] no-underline transition-colors hover:border-[var(--lagoon-deep)] hover:text-[var(--lagoon-deep)]"
            >
              <Linkedin
                className="h-3.5 w-3.5 translate-y-px"
                strokeWidth={1.75}
              />
              linkedin.com/in/dvnnfrr
              <ArrowUpRight
                className="h-3.5 w-3.5 translate-y-px transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
                strokeWidth={1.5}
              />
            </a>
          </PolicySection>
        </div>
      </article>
    </main>
  )
}

function PolicySection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-x-8 gap-y-4 sm:grid-cols-[14rem_1fr]">
      <h2 className="display-title text-xl font-medium leading-snug text-foreground sm:text-[1.375rem]">
        {title}
      </h2>
      <div className="text-[var(--sea-ink-soft)]">{children}</div>
    </section>
  )
}

function Bullet({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[1.25rem_1fr] gap-x-3">
      <span aria-hidden className="kicker translate-y-1 text-[var(--lagoon-deep)]">
        §
      </span>
      <div>
        <span className="font-medium text-foreground">{label}.</span>{' '}
        <span>{children}</span>
      </div>
    </li>
  )
}
