export type TrackStepTone = 'mint' | 'sky' | 'butter' | 'blush'

export type TrackStep = {
  n: number
  short: string
  title: string
  desc: string
  detail: string
  tone: TrackStepTone
}

export const TRACK_STEPS: TrackStep[] = [
  {
    n: 1,
    short: 'Unggah',
    title: 'Unggah skripsi',
    desc: 'baca tiap halaman',
    detail:
      'Unggah PDF skripsimu. Tiap halaman dibaca dan teksnya diekstrak supaya sitasi dan Daftar Pustaka bisa diurai di langkah berikutnya.',
    tone: 'mint',
  },
  {
    n: 2,
    short: 'Sitasi',
    title: 'Urai sitasi',
    desc: 'sitasi dalam teks',
    detail:
      'Sitasi yang muncul di badan tulisan — misalnya (Putra, 2021) atau [12] — dikumpulkan dari tiap halaman, lengkap dengan tempat kemunculannya.',
    tone: 'mint',
  },
  {
    n: 3,
    short: 'Pustaka',
    title: 'Urai Daftar Pustaka',
    desc: 'entri jadi data',
    detail:
      'Tiap entri di Daftar Pustaka diurai menjadi data terstruktur (penulis, tahun, judul) supaya bisa dipasangkan dengan sitasi di dalam teks.',
    tone: 'sky',
  },
  {
    n: 4,
    short: 'Cocokkan',
    title: 'Cocokkan sitasi',
    desc: 'sitasi ke pustaka',
    detail:
      'Tiap sitasi dalam teks dipasangkan ke entri Daftar Pustaka-nya. Di sini ketahuan kalau ada sitasi tanpa entri, atau entri yang tak pernah disitasi.',
    tone: 'sky',
  },
  {
    n: 5,
    short: 'Sumber',
    title: 'Siapkan PDF sumber',
    desc: 'ambil otomatis / unggah',
    detail:
      'CiteTrack mencoba mengambil PDF tiap referensi secara otomatis dari sumber publik seperti Crossref, OpenAlex, Unpaywall, dan arXiv. PDF yang belum ketemu tinggal kamu unggah sendiri, lalu tiap PDF dipasangkan ke referensinya.',
    tone: 'butter',
  },
  {
    n: 6,
    short: 'Kalimat',
    title: 'Telusuri kalimat',
    desc: 'sampai ke sumbernya',
    detail:
      'Tiap sitasi ditelusuri sampai ke halaman dan kalimat di paper sumber, lengkap dengan tingkat keyakinan, supaya kamu bisa memastikan klaim memang ada di sumbernya.',
    tone: 'blush',
  },
]
