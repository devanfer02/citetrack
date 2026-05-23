import { query } from '@anthropic-ai/claude-agent-sdk'
import type { EydFinding } from '#/services/evaluation/eyd/rules'

const MAX_CHARS_PER_CALL = 20000

const RULE_CONTEXT = `Aturan EYD (Ejaan Bahasa Indonesia yang Disempurnakan, Permendiknas 46/2009) yang relevan:

1. Penulisan kata depan: "di", "ke", dan "dari" ditulis terpisah dari kata yang mengikutinya ketika berfungsi sebagai kata depan penunjuk tempat/tujuan/asal. Contoh benar: "di kantor", "ke sekolah", "dari rumah". Awalan "di-", "ke-" ditulis serangkai ketika berupa imbuhan pembentuk verba/nomina, contoh: "dibaca", "ditulis".

2. Partikel "-lah", "-kah", "-tah" ditulis serangkai dengan kata yang mendahuluinya. Contoh: "bacalah", "apakah". Partikel "pun" ditulis terpisah KECUALI pada bentuk tetap: walaupun, meskipun, adapun, andaipun, biarpun, kalaupun, kendatipun, maupun, sekalipun, sungguhpun.

3. Kata baku vs tidak baku yang sering keliru: "daripada" (satu kata) bukan "dari pada"; "kepada" (satu kata) bukan "ke pada"; "bagaimana" (satu kata) bukan "bagai mana"; "ketika" bukan "ke tika"; "di mana" (dua kata) bukan "dimana"; "ke mana" bukan "kemana"; "di atas"/"di bawah"/"di dalam"/"di luar" (dua kata).

4. Huruf kapital digunakan pada: awal kalimat, nama orang/tempat/lembaga/agama, gelar kehormatan/keturunan yang diikuti nama (Sultan Hasanuddin), nama geografi sebagai nama diri (Asia Tenggara), tetapi TIDAK untuk nama jenis (jeruk bali, gula jawa) atau nama diri yang menjadi nama satuan/ukuran (5 ampere, 15 watt).

5. Huruf miring digunakan untuk: judul buku/majalah/surat kabar yang dikutip, istilah asing yang belum diserap ke dalam bahasa Indonesia, istilah ilmiah (nama Latin).

6. Tanda hubung (-): menghubungkan unsur kata ulang (anak-anak), menyambung awalan dengan angka/huruf kapital (se-Indonesia), menyambung imbuhan dengan kata serapan (di-sticker, pen-tackle-an).

7. Tanda pisah (—) tidak sama dengan tanda hubung (-). Gunakan tanda pisah untuk menyisipkan keterangan atau rentang waktu/tempat.

8. Angka dan bilangan: angka digunakan untuk jumlah ≥10 atau ukuran/waktu; bilangan ditulis dengan huruf jika kurang dari dua kata. Penulisan tanggal: "17 Agustus 1945" (hari bulan tahun), bukan "17-8-1945" dalam teks formal.
`

export async function runEydAgent(text: string): Promise<EydFinding[]> {
  const trimmed = text.slice(0, MAX_CHARS_PER_CALL)

  const prompt = `${RULE_CONTEXT}

Berikut adalah teks skripsi yang harus diperiksa. Tandai SETIAP pelanggaran aturan EYD di atas. Abaikan masalah gaya atau selera — hanya laporkan pelanggaran aturan EYD yang konkret.

Kembalikan JSON dengan struktur persis seperti ini, tanpa markdown, tanpa komentar:

{
  "findings": [
    {
      "offset": <int, posisi karakter mulai dalam teks>,
      "length": <int, panjang karakter>,
      "ruleId": "<kode aturan singkat, misal: eyd.preposition-di, eyd.huruf-kapital, eyd.miring-asing>",
      "severity": "error" | "warning",
      "message": "<penjelasan singkat dalam bahasa Indonesia>",
      "suggestion": "<bentuk perbaikan>"
    }
  ]
}

Teks:
"""
${trimmed}
"""`

  try {
    let resultText = ''
    for await (const message of query({
      prompt,
      options: { allowedTools: [], maxTurns: 1 },
    })) {
      if ('result' in message) {
        resultText = message.result as string
      }
    }

    if (!resultText) return []

    const jsonStart = resultText.indexOf('{')
    const jsonEnd = resultText.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return []

    const parsed = JSON.parse(
      resultText.slice(jsonStart, jsonEnd + 1),
    ) as { findings?: EydFinding[] }

    if (!Array.isArray(parsed.findings)) return []

    return parsed.findings.filter(
      (f) =>
        typeof f.offset === 'number' &&
        typeof f.length === 'number' &&
        typeof f.ruleId === 'string' &&
        typeof f.message === 'string' &&
        (f.severity === 'error' || f.severity === 'warning' || f.severity === 'info'),
    )
  } catch {
    return []
  }
}
