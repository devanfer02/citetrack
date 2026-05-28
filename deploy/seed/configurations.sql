-- Application-level configurations. Keep in sync with src/lib/configurations.ts
-- when adding or removing keys. Defaults below match CONFIG_DEFAULTS.
-- Idempotent: re-running on a populated DB is a no-op.

INSERT INTO configurations (code, value, description) VALUES
  (
    'autofetch.staleness_timeout_ms',
    '300000'::jsonb,
    'Kalau pencarian PDF sumber diam tanpa kemajuan selama waktu ini, dia ditandai gagal pada pemeriksaan berikutnya. Disimpan dalam milidetik.'
  ),
  (
    'autofetch.download_timeout_ms',
    '30000'::jsonb,
    'Berapa lama menunggu satu unduhan PDF sumber sebelum dibatalkan. Disimpan dalam milidetik.'
  ),
  (
    'autofetch.concurrency',
    '4'::jsonb,
    'Berapa PDF sumber yang boleh diunduh bersamaan saat pencarian otomatis berjalan.'
  ),
  (
    'upload.max_file_size_bytes',
    '52428800'::jsonb,
    'Ukuran maksimum PDF yang boleh diunggah, baik skripsi maupun sumber. Diisi dalam MB, disimpan dalam bytes.'
  ),
  (
    'purge.retention_days',
    '30'::jsonb,
    'Pekerjaan yang sudah selesai (berhasil atau gagal) dan usianya lebih dari batas ini akan dihapus saat kamu menekan tombol "Bersihkan sekarang". Pekerjaan yang masih berjalan tidak disentuh.'
  ),
  (
    'purge.orphan_grace_hours',
    '24'::jsonb,
    'Saat pembersihan, berkas di disk yang sudah tidak punya catatan di database ikut terhapus, asalkan usianya lebih dari batas jam ini. Jeda ini melindungi unggahan yang baru saja dimulai.'
  ),
  (
    'kbbi.use_tor_proxy',
    '0'::jsonb,
    'Saat aktif, pencarian KBBI ke kbbi.kemendikdasmen.go.id dirutekan lewat sidecar Tor sehingga batas harian per-IP tidak menghambat evaluasi. Sumber KBBI lain tetap langsung. Sidecar otomatis ikut start di docker compose; saat mati, tetap aman karena fallback ke koneksi langsung.'
  ),
  (
    'kbbi.external_lookup_budget',
    '300'::jsonb,
    'Berapa kata unik yang boleh dicek ke sumber KBBI eksternal per pekerjaan evaluasi. Kata yang tidak ada di kamus lokal akan dicek satu per satu ke kbbi.web.id, kbbi.kemendikdasmen.go.id, dst., dan setelah jatah ini habis, sisanya dilaporkan sebagai "tidak bisa diverifikasi online" tanpa mengetuk sumber lagi. Pasang ke 0 untuk menonaktifkan batas (semua kata diteruskan ke eksternal, hati-hati: bisa kena rate-limit pada skripsi panjang). Default 300 cocok untuk satu naskah dengan banyak istilah asing/typo yang masih wajar.'
  ),
  (
    'kbbi.external_lookup_timeout_ms',
    '7000'::jsonb,
    'Berapa lama menunggu satu kata diverifikasi ke sumber KBBI eksternal sebelum pencarian dihentikan dan kata itu ditandai "tidak bisa diverifikasi online". Ini batas yang kita pasang sendiri, bukan galat jaringan -- di Log API ia muncul sebagai outcome "aborted", bukan "network error". Diisi dalam detik, disimpan dalam milidetik. Naikkan kalau sumber sering lambat dan banyak kata terlewat; pasang 0 untuk mematikan batas (tunggu tanpa henti, hati-hati pada skripsi panjang). Default 7 detik.'
  ),
  (
    'kbbi.source.kemendikdasmen',
    '1'::jsonb,
    'Saat aktif, sumber resmi kbbi.kemendikdasmen.go.id ikut dipakai untuk verifikasi kata. Resmi tetapi sering kena batas harian per-IP -- pertimbangkan menyalakan "Rute KBBI Kemendikdasmen via Tor" bila ingin tetap menjangkau ini saat batas tercapai.'
  ),
  (
    'kbbi.source.web_id',
    '1'::jsonb,
    'Saat aktif, kbbi.web.id ikut dipakai. Mirror cepat dengan cakupan KBBI V; jarang rate-limit dan biasanya jadi tulang punggung verifikasi online.'
  ),
  (
    'kbbi.source.typoonline',
    '1'::jsonb,
    'Saat aktif, typoonline.com ikut dipakai. Sumber cadangan ringan untuk pengecekan kata baku.'
  ),
  (
    'kbbi.source.co_id',
    '0'::jsonb,
    'Saat aktif, kbbi.co.id ikut dipakai. Sering mengembalikan 429 (rate-limit) sehingga default mati -- nyalakan kalau kamu butuh tambahan sumber dan tidak masalah dengan jeda otomatis.'
  ),
  (
    'kbbi.source.raf555',
    '1'::jsonb,
    'Saat aktif, kbbi.raf555.dev (JSON API, KBBI VI dari official APK v6.1.0) ikut dipakai. Cakupan paling lengkap; matikan kalau kamu mau hanya pakai sumber Indonesia.'
  )
ON CONFLICT (code) DO NOTHING;
