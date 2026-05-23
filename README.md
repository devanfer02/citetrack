# CiteTrack

Alat bantu skripsi untuk mahasiswa FILKOM Universitas Brawijaya yang memeriksa dua hal sekaligus pada satu PDF draft:

1. **Citation tracer** — mendeteksi sitasi dalam teks, mencocokkannya ke entri di Daftar Pustaka, lalu mencoba mengunduh PDF sumber dari penyedia terbuka (CrossRef, OpenAlex, Unpaywall, Europe PMC, Semantic Scholar, PubMed, dll.). Untuk tiap sitasi, sistem berusaha menemukan halaman dan kutipan persis yang dirujuk di PDF sumbernya.
2. **Evaluation** — memeriksa tulisan draft terhadap tiga set aturan:
   - **KBBI** — kata-kata yang tidak ditemukan di Kamus Besar Bahasa Indonesia, dengan saran perbaikan.
   - **EYD** — pelanggaran ejaan yang disempurnakan (kapitalisasi, tanda baca, kata baku, dsb.).
   - **FILKOM Template** — kesesuaian struktur dokumen dengan template skripsi FILKOM UB v3.0 (halaman PERNYATAAN ORISINALITAS, PRAKATA, ABSTRACT, struktur BAB, dst.).

Output tersimpan per upload sehingga halaman **History** memperlihatkan semua pemeriksaan lampau, baik mode Track maupun mode Evaluation.

## Tumpukan teknologi

- **Framework:** [TanStack Start](https://tanstack.com/start) (SSR + server functions) di atas React 19
- **Routing:** TanStack Router file-based di `src/routes/`
- **Data fetching & forms:** TanStack Query + TanStack Form
- **Database:** PostgreSQL via Drizzle ORM (`src/db/schema.ts`)
- **UI:** shadcn/ui + Radix + Tailwind CSS 4 + Lucide
- **Validasi runtime:** Zod v4
- **PDF:** pdf.js (`pdfjs-dist`) untuk ekstraksi teks dan rendering preview
- **Runtime:** Bun

## Panduan penggunaan

Setelah server berjalan dan database terisi (lihat bagian setup di bawah), buka `http://localhost:3000` di browser.

### Mode Track — telusur sitasi

1. Buka halaman **Track** dari navigasi atas.
2. Lepas (drag-and-drop) atau pilih file PDF skripsi. Maksimum 50 MB.
3. Tunggu proses ekstraksi teks. Setelah selesai, daftar sitasi yang terdeteksi muncul di tabel.
4. Sistem secara otomatis mencocokkan setiap sitasi ke entri **Daftar Pustaka** di akhir dokumen.
5. Untuk entri yang berhasil dicocokkan, sistem mencoba mengambil PDF sumber dari penyedia terbuka. Yang berhasil ditandai **fetched**.
6. Untuk setiap PDF sumber yang berhasil diambil, halaman dan kutipan persis yang dirujuk ditandai di bagian **Passages**.
7. Klik baris untuk membuka preview PDF beserta highlight halamannya.

### Mode Evaluation — periksa tulisan

1. Buka halaman **Evaluation**.
2. Lepas atau pilih file PDF skripsi (PDF only, max 50 MB).
3. Pemeriksaan berjalan paralel dalam tiga kategori:
   - **Extract** — menarik teks dari setiap halaman PDF.
   - **FILKOM** — mengecek struktur template (halaman wajib, hierarki BAB, dsb.).
   - **KBBI** — menjalankan setiap token melawan kamus lokal + lookup eksternal (dengan cache).
   - **EYD** — mengecek aturan ejaan kontemporer.
4. Saat masih berjalan, hitungan temuan per kategori muncul di atas. Setelah semua selesai, tabel temuan terisi penuh.
5. Filter temuan berdasarkan kategori (KBBI / EYD / FILKOM) di sidebar. Klik temuan untuk melompat ke halaman PDF terkait.

### Mode History — riwayat

Halaman **History** menampilkan semua upload lampau, dengan tab terpisah untuk **Track** dan **Evaluation**. Klik salah satu untuk membuka kembali laporannya — semuanya tersimpan di database, tidak perlu meng-upload ulang.

## Local setup dengan Docker

Cara tercepat — semua sudah disiapkan via Docker Compose: database, migrasi, seed konfigurasi, dan load KBBI berjalan otomatis.

### Prasyarat

- Docker Engine 20+ dan `docker compose`.
- File dump KBBI di `deploy/seed/kbbi-dictionary.sql` (file ini **gitignored** — minta dari pengelola atau ekstrak sendiri dari sumber resmi KBBI Kemendikdasmen).

### Langkah

```bash
# 1. Salin contoh env
cp .env.example .env.local
# Edit .env.local kalau perlu — minimal DATABASE_URL boleh dibiarkan default.
# API key (UNPAYWALL_EMAIL, CORE_API_KEY, dll) opsional — tanpa key, provider tersebut dilewati.

# 2. Bangun image dan jalankan
docker compose up --build

# Pada bootup pertama, entrypoint akan:
#   - Menjalankan `drizzle-kit push --force` untuk membuat semua tabel.
#   - Menjalankan `psql -f deploy/seed/configurations.sql` dan `deploy/seed/vocabulary.sql` untuk seed awal.
#   - Memuat dump KBBI ke tabel `dictionary` (kalau dump tersedia dan tabel masih kosong).
#   - Menjalankan server di port 3000.

# 3. Buka http://localhost:3000
```

### Variabel environment yang dibaca compose

| Env | Default | Keterangan |
|-----|---------|------------|
| `POSTGRES_PASSWORD` | `postgres` | Password user `postgres` di container DB |
| `APP_PORT` | `3000` | Port host yang diekspos |
| `UNPAYWALL_EMAIL` | _kosong_ | Aktifkan auto-fetch via Unpaywall (butuh kontak email) |
| `CORE_API_KEY` | _kosong_ | Aktifkan CORE full-text discovery |
| `SEMANTIC_SCHOLAR_API_KEY` | _kosong_ | Lebih tinggi rate limit di Semantic Scholar |
| `NCBI_API_KEY` | _kosong_ | Lebih tinggi rate limit di PubMed / PMC |

Semua provider "no-key" (CrossRef, OpenAlex, arXiv, Europe PMC tier gratis) **selalu aktif** tanpa konfigurasi.

### Operasional

```bash
# Lihat log
docker compose logs -f app

# Reset database (HATI-HATI: menghapus semua data)
docker compose down -v && docker compose up --build

# Akses psql di container DB
docker compose exec db psql -U postgres -d citetrack
```

## Local dev setup (tanpa Docker)

Untuk pengembangan aktif (HMR, debugging, vitest cepat), jalankan langsung di host.

### Prasyarat

- **Bun** 1.1 atau lebih baru — `curl -fsSL https://bun.sh/install | bash`
- **PostgreSQL** 14+ jalan di local (host `localhost:5432`)
- **psql CLI** — untuk load KBBI dump
- File dump KBBI di `deploy/seed/kbbi-dictionary.sql` (gitignored)

### Langkah

```bash
# 1. Install dependensi
bun install

# 2. Siapkan env
cp .env.example .env.local
# Pastikan DATABASE_URL menunjuk ke Postgres lokal.

# 3. Buat database (sekali saja)
createdb citetrack
# atau via psql:
#   psql -U postgres -c "CREATE DATABASE citetrack"

# 4. Push schema Drizzle ke database
bun run db:push

# 5. Seed configurations dan vocabulary (idempotent)
psql "$DATABASE_URL" -f deploy/seed/configurations.sql
psql "$DATABASE_URL" -f deploy/seed/vocabulary.sql

# 6. Load dump KBBI (tabel `dictionary` ~116k baris)
bash deploy/load-kbbi.sh

# 6. Jalankan dev server (port 3000, dengan HMR)
bun run dev
```

Buka `http://localhost:3000`.

### Perintah harian

```bash
bun run dev           # Dev server (port 3000, SSR + HMR)
bun run build         # Production build ke .output/
bun run preview       # Jalankan production build secara lokal
bun test              # Vitest (NODE_ENV=test, validasi env diskip)
bun run lint          # oxlint check
bun run lint:fix      # oxlint dengan auto-fix
bun run db:generate   # Generate file migrasi dari perubahan schema
bun run db:migrate    # Apply migrasi
bun run db:push       # Push schema langsung (dev shortcut, tanpa file migrasi)
bun run db:studio     # Buka Drizzle Studio (UI database)
```

Pre-commit hook (husky + lint-staged) menjalankan `oxlint --fix` di file `.ts` / `.tsx` yang di-stage — biarkan jalan, jangan lewati dengan `--no-verify`.

### Troubleshooting

- **`DATABASE_URL` invalid saat dev** — periksa bahwa Postgres sudah jalan dan `.env.local` terisi. Test cepat: `psql "$(grep DATABASE_URL .env.local | cut -d= -f2)" -c 'SELECT 1'`.
- **KBBI dump tidak ada** — KBBI lookup masih jalan (fallback ke lookup eksternal dengan budget terbatas), tapi banyak FP. Letakkan dump di `deploy/seed/kbbi-dictionary.sql` dan jalankan `bash deploy/load-kbbi.sh`.
- **Port 3000 sudah dipakai** — ubah di `package.json` script `dev` atau set `APP_PORT=3001 docker compose up`.
- **Vitest timeout di integration tests** — tes integrasi membutuhkan koneksi DB dan PDF fixture di `.claude/pdf_examples/`; lewati dengan `bun test tests/services/parser` untuk tes yang lebih cepat.

## Struktur direktori

```
src/
  routes/                # File-based routes (TanStack Router)
  components/            # UI components (app-level + shadcn primitives di ui/)
  services/
    pdf/                 # Ekstraksi teks, upload, kompresi, auto-fetch sumber
    parser/              # Parser sitasi & Daftar Pustaka
    matcher/             # Mencocokkan sitasi ke referensi, halaman, kutipan
    evaluation/
      kbbi/              # Lookup KBBI + morfologi + scraper Kemendikdasmen
      eyd/               # Aturan EYD
      filkom/            # Validator template
      orchestrator.ts    # Driver evaluasi (KBBI + EYD + FILKOM)
    ai/                  # (Placeholder untuk passage matching lintas-bahasa)
  db/
    schema.ts            # Drizzle schema: jobs, pages, findings, dictionary, dst.
    index.ts             # Koneksi Drizzle
  lib/                   # Auth, paths, utilitas kecil
  schemas/               # Zod schemas yang dipakai server + client
  stores/                # Zustand global state (kalau ada)
  styles.css             # Tailwind + CSS variables (tema, glass, animasi)
deploy/                  # Deployment artefacts: SQL seeds + KBBI loader
  seed/
    configurations.sql   # App configurations (idempotent)
    vocabulary.sql       # KBBI vocabulary overrides (idempotent)
    kbbi-dictionary.sql  # KBBI dictionary dump (gitignored, ~116k rows)
  load-kbbi.sh           # Shell helper that runs psql -f on the dump
.claude/scripts/         # Local-only diagnostic + training tooling (Bun .ts)
  run-iteration.ts       # Evaluation iteration runner
  diff-iterations.ts     # Diff two iteration folders
  run-track-iteration.ts # Track-pipeline iteration runner
  classify-kbbi-iter.ts  # KBBI TP/FP classifier (used by the FP-reduction loop)
  test-autofetch.ts      # Diagnostic harness for the source-PDF auto-fetch chain
  inspect-pdf-fonts.ts   # PDF font / character debug
tests/                   # Vitest (unit + integration)
drizzle/                 # File migrasi yang dihasilkan drizzle-kit
data/seed/               # Source TSVs used to regenerate deploy/seed/*.sql
docs/                    # Dokumentasi internal: spec, plan, training iterations
```

## Lisensi

© 2026 CiteTrack. All rights reserved.
