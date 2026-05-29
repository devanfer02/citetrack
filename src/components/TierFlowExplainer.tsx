import { ArrowRight } from 'lucide-react'
import type { EvaluationTierStats } from '#/schemas/evaluation-tier-stats'
import {
  buildTierSegments,
  TIER_STEPS,
  type SegmentTone,
  type StepTone,
} from '#/lib/evaluation/tier-flow'

interface TierFlowExplainerProps {
  stats: EvaluationTierStats | undefined
  className?: string
}

const STEP_BG: Record<StepTone, string> = {
  mint: 'bg-[var(--bg-mint)]',
  sky: 'bg-[var(--bg-sky)]',
  blush: 'bg-[var(--bg-blush)]',
}

const STEP_BORDER: Record<StepTone, string> = {
  mint: 'border-[color-mix(in_oklab,var(--marker-green)_55%,var(--line))]',
  sky: 'border-[color-mix(in_oklab,var(--marker-sky)_55%,var(--line))]',
  blush: 'border-[color-mix(in_oklab,var(--marker-blush)_55%,var(--line))]',
}

const SEGMENT_BG: Record<SegmentTone, string> = {
  mint: 'bg-[var(--bg-mint)]',
  blush: 'bg-[var(--bg-blush)]',
  butter: 'bg-[var(--bg-butter)]',
}

const formatCount = (value: number): string => value.toLocaleString('id-ID')

export function TierFlowExplainer({ stats, className }: TierFlowExplainerProps) {
  const hasData = stats !== undefined && stats.total > 0
  const segments = hasData ? buildTierSegments(stats) : []
  const localOnly = stats?.localOnly ?? false

  return (
    <section
      id="cara-kerja"
      className={`soft-card scroll-mt-24 border-[var(--ink)]/85! px-6 py-7 shadow-[5px_5px_0_0_var(--ink)]! sm:px-8 ${className ?? ''}`}
      data-tone="cream"
      aria-label="Cara tiap kata diperiksa"
    >
      <h2 className="display-title text-lg font-bold leading-snug text-[var(--ink)]">
        Bagaimana tiap kata diperiksa
      </h2>
      {localOnly && (
        <p className="mt-1 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--ink-faint)]">
          Mode lokal saja · KBBI daring dimatikan
        </p>
      )}
      <p className="mt-2 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
        {localOnly ? (
          <>
            Tiap kata dicek bertahap, tapi semuanya berhenti di kamus yang ada di
            server — dump KBBI lokal, cache, dan daftar kata asing. Verifikasi ke
            KBBI daring sedang dimatikan di Pengaturan, jadi pemeriksaan lebih
            cepat dan tanpa internet. Kata yang tidak ada di kamus lokal ditandai
            “belum bisa diverifikasi online”, bukan salah.
          </>
        ) : (
          <>
            Tiap kata dicek bertahap dari langkah 1 ke langkah 5, dan berhenti
            begitu ada yang cocok. Karena kamus KBBI sudah disalin ke server,
            kebanyakan kata selesai di langkah awal — cepat dan tanpa internet.
            Hanya sisa kecil yang naik sampai ke KBBI daring.
          </>
        )}
      </p>

      <ol className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
        {TIER_STEPS.map((step, index) => {
          const dimmed = localOnly && step.online === true
          return (
          <li key={step.n} className="flex flex-col sm:flex-1 sm:flex-row sm:items-center">
            <div
              className={`relative flex-1 rounded-2xl border px-3 pb-3.5 pt-6 text-center shadow-[3px_3px_0_0_color-mix(in_oklab,var(--ink)_12%,transparent)] ${STEP_BG[step.tone]} ${STEP_BORDER[step.tone]} ${dimmed ? 'opacity-55' : ''}`}
            >
              <span
                className="absolute -top-3.5 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-white text-xs font-bold text-[var(--ink)] shadow-[2px_2px_0_0_var(--ink)]"
                aria-hidden="true"
              >
                {step.n}
              </span>
              <span className="sr-only">
                Langkah {step.n}: {dimmed ? '(dimatikan) ' : ''}
              </span>
              <span
                className={`block text-sm font-bold leading-tight text-[var(--ink)] ${dimmed ? 'line-through decoration-[var(--ink-faint)]' : ''}`}
              >
                {step.title}
              </span>
              {dimmed ? (
                <span className="mt-1.5 inline-block rounded-full border border-[var(--ink-faint)]/40 bg-white/80 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-[var(--ink-soft)]">
                  Dimatikan
                </span>
              ) : (
                <span className="mt-1 block text-xs leading-snug text-[var(--ink-soft)]">
                  {step.desc}
                </span>
              )}
            </div>
            {index < TIER_STEPS.length - 1 && (
              <span
                className="flex items-center justify-center py-1.5 text-[var(--ink-faint)] sm:px-1.5 sm:py-0"
                aria-hidden="true"
              >
                <ArrowRight
                  className="size-5 rotate-90 sm:rotate-0"
                  strokeWidth={2.5}
                />
              </span>
            )}
          </li>
          )
        })}
      </ol>

      <div className="mt-4 flex justify-between text-[0.6875rem] font-medium uppercase tracking-wide text-[var(--ink-faint)]">
        <span>cepat · tanpa internet</span>
        <span>{localOnly ? 'online dimatikan' : 'lambat · terbatas kuota'}</span>
      </div>

      <dl className="mt-7 flex flex-col gap-3.5 border-t border-[var(--line)] pt-6">
        {TIER_STEPS.map((step) => {
          const dimmed = localOnly && step.online === true
          return (
          <div key={step.n} className="flex gap-3">
            <dt
              className={`flex size-6 flex-none items-center justify-center rounded-full border-2 border-[var(--ink)] text-[0.6875rem] font-bold text-[var(--ink)] ${STEP_BG[step.tone]}`}
            >
              {step.n}
            </dt>
            <dd className="text-[0.875rem] leading-relaxed text-[var(--ink-soft)]">
              <span className="font-bold text-[var(--ink)]">{step.title}.</span>{' '}
              {dimmed && (
                <span className="font-semibold text-[var(--ink)]">
                  Sedang dimatikan —{' '}
                </span>
              )}
              {step.detail}
            </dd>
          </div>
          )
        })}
      </dl>

      {hasData ? (
        <div className="mt-6">
          <div className="flex h-9 w-full overflow-hidden rounded-lg" role="presentation">
            {segments.map((segment) => (
              <div
                key={segment.key}
                className={`flex items-center justify-center text-xs font-bold text-[var(--ink)] ${SEGMENT_BG[segment.tone]}`}
                style={{ width: `${segment.percent}%` }}
              >
                {segment.percent >= 12 ? `${segment.percent}%` : ''}
              </div>
            ))}
          </div>
          <dl className="mt-4 flex flex-col gap-2.5">
            {segments.map((segment) => (
              <div key={segment.key} className="flex items-baseline gap-3 text-sm">
                <span
                  className={`mt-1 size-3 flex-none rounded-sm ${SEGMENT_BG[segment.tone]}`}
                  aria-hidden="true"
                />
                <dt className="font-semibold text-[var(--ink)]">{segment.label}</dt>
                <dd className="text-[var(--ink-soft)]">
                  {segment.percent}% · {formatCount(segment.count)} kata
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-[var(--ink-faint)]">
            Dihitung dari seluruh kata yang pernah diperiksa di CiteTrack
            ({formatCount(stats.total)} kata).
          </p>
        </div>
      ) : (
        <p className="mt-6 rounded-lg bg-[var(--bg-sky)] px-4 py-3 text-sm leading-relaxed text-[var(--ink-soft)]">
          {localOnly ? (
            <>
              Ruang ini masih kosong karena belum ada skripsi yang diperiksa.
              Selama mode lokal saja aktif, semua kata dicek ke kamus di server;
              yang tidak ketemu masuk hitungan “belum bisa diverifikasi online”,
              dan tidak ada yang menyentuh KBBI daring.
            </>
          ) : (
            <>
              Ruang ini masih kosong karena belum ada skripsi yang diperiksa.
              Setelah pemeriksaan pertama, di sini muncul rinciannya: dari semua
              kata yang dicek, berapa yang sudah ketemu di kamus lokal server dan
              berapa yang sampai harus dicek ke KBBI daring lewat internet.
              Biasanya bagian lokal yang paling besar.
            </>
          )}
        </p>
      )}

      <p className="mt-5 rounded-xl bg-[var(--bg-butter)] px-4 py-3 text-[0.8125rem] leading-relaxed text-[var(--ink)]">
        {localOnly ? (
          <>
            Mode lokal saja sedang aktif. Tiap kata hanya dicek ke kamus di
            server, dan yang tidak ketemu ditandai{' '}
            <span className="rounded border border-[var(--ink-faint)]/30 bg-white px-1.5 py-0.5 text-xs">
              belum bisa diverifikasi online
            </span>{' '}
            — bukan berarti salah, hanya belum dipastikan ke KBBI daring. Matikan
            mode ini di Pengaturan kalau kamu mau verifikasi online lagi.
          </>
        ) : (
          <>
            Kalau kuota KBBI daring habis atau KBBI sedang tak terjangkau, sisa
            kata ditandai{' '}
            <span className="rounded border border-[var(--ink-faint)]/30 bg-white px-1.5 py-0.5 text-xs">
              diperiksa: basis data lokal
            </span>{' '}
            di hasil — artinya kata itu dicek ke kamus lokal saja, belum sempat
            dipastikan online. Bukan berarti salah.
          </>
        )}
      </p>
    </section>
  )
}
