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
  )
ON CONFLICT (code) DO NOTHING;
