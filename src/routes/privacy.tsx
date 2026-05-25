import { createFileRoute } from '@tanstack/react-router'
import { ArrowUpRight, Github, Linkedin } from 'lucide-react'
import { AccentInk } from '#/components/AccentWord'
import { Section } from '#/components/Section'
import {
  CITETRACK_REPO_URL,
  CITETRACK_REPO_ISSUES_URL,
  CREATOR_LINKEDIN_URL,
} from '#/lib/citetrack-links'
import { useIsLocalEnv } from '#/stores/preview-public-mode'

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
  const isLocalEnv = useIsLocalEnv()
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

          {!isLocalEnv && (
            <>
              <PolicySection title="Khusus demo publik">
                <p className="mb-4">
                  Demo ini jalan di server kami, terbuka tanpa login.
                  Beberapa hal di sini berbeda dari versi lokal yang kamu
                  jalankan sendiri.
                </p>
                <ul className="list-none space-y-4 pl-0">
                  <Bullet label="Unggahanmu terlihat lewat tautan">
                    Siapa saja yang punya URL halaman hasilmu bisa
                    membukanya. Tidak ada login, jadi tidak ada cara
                    membatasi siapa yang lihat. Kalau kamu kirim tautan ke
                    pembimbing, jangan kaget kalau dia teruskan ke orang
                    lain.
                  </Bullet>
                  <Bullet label="Retensi sekitar 24 jam">
                    Sapuan harian menghapus unggahan dan hasilnya setelah
                    lewat batas itu. Tidak ada cara memperpanjang. Kalau
                    kamu butuh hasilnya lebih lama, simpan tangkapan
                    layar atau jalankan CiteTrack lokal.
                  </Bullet>
                  <Bullet label="Tidak ada tombol hapus">
                    Kalau temanmu unggah skripsimu di sini sebagai
                    bercanda, kamu tetap tidak bisa minta penghapusan.
                    Kami tidak punya cara membuktikan kamu pemiliknya,
                    dan kalau permintaan hapus bisa diajukan siapa saja,
                    siapa saja juga bisa menghapus kerjaan orang lain.
                    Tunggu sapuan harian.
                  </Bullet>
                  <Bullet label="PDF di server kami, bukan komputermu">
                    Selama 24 jam itu, file dan teks ekstraknya ada di
                    disk VPS kami. Kalau skripsimu sensitif atau belum
                    kamu serahkan ke pembimbing, lebih baik jalankan
                    CiteTrack di komputermu sendiri.{' '}
                    <a
                      href={CITETRACK_REPO_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-[var(--lagoon-deep)] underline decoration-[var(--lagoon)]/40 decoration-1 underline-offset-[3px] hover:decoration-[var(--lagoon-deep)]"
                    >
                      Panduan di GitHub
                    </a>
                    .
                  </Bullet>
                </ul>
              </PolicySection>

              <PolicySection title="Batas tanggung jawab">
                <p className="mb-4">
                  Demo ini gratis, terbuka, dan dijalankan sendirian
                  tanpa garansi. Yang kamu unggah, kamu yang tanggung.
                </p>
                <ul className="list-none space-y-4 pl-0">
                  <Bullet label="Yang kamu unggah, jadi tanggung jawabmu">
                    Jangan unggah dokumen orang lain tanpa izin. Jangan
                    unggah materi yang kalau bocor bisa merugikan orang
                    lain. Kami tidak bisa memverifikasi siapa yang unggah
                    apa, jadi keputusan ada di kamu.
                  </Bullet>
                  <Bullet label="Demo bisa mati kapan saja">
                    Tidak ada SLA, tidak ada jam operasional. Bisa down
                    saat update, saat kekurangan disk, atau saat
                    kebanyakan beban. Kalau kamu butuh tools ini untuk
                    deadline ketat, jalankan versi lokal.
                  </Bullet>
                  <Bullet label="Hasil evaluasi bukan validasi akademis">
                    Pencocokan kutipan dan pemeriksaan EYD/KBBI bersifat
                    heuristik. Bisa salah, bisa kelewat. Pembimbingmu
                    yang menentukan apakah tulisan dan sitasimu benar,
                    bukan CiteTrack.
                  </Bullet>
                  <Bullet label="Pemelihara tidak bertanggung jawab atas isi unggahan">
                    Kalau ada yang unggah konten melanggar hak cipta,
                    data pribadi pihak ketiga, atau hal sejenis ke demo
                    ini, pemelihara tidak ikut bertanggung jawab atas
                    isinya. Aturannya sama: yang unggah, dia yang
                    tanggung.
                  </Bullet>
                </ul>
              </PolicySection>
            </>
          )}

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
