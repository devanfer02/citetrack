import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CopyIconButton } from '#/components/CopyIconButton'
import { Switch } from '#/components/ui/switch'
import type { ConfigKey } from '#/lib/configurations'
import {
  type ConfigurationRow,
  updateConfiguration,
} from '#/services/configurations'

// Short, one-line copy per kbbi.source.* row. The longer copy lives in
// configurations.ts and shows up as the tooltip on hover.
const KBBI_SOURCE_BLURB: Record<string, string> = {
  'kbbi.source.kemendikdasmen': 'Sumber resmi. Batas harian per-IP cepat habis.',
  'kbbi.source.web_id':
    'Cepat dan stabil, cakupan KBBI V. Biasanya jadi yang pertama dapat hasil.',
  'kbbi.source.typoonline': 'Cadangan ringan untuk cek kata baku.',
  'kbbi.source.co_id':
    'Sering balas 429. Default mati; nyalakan kalau butuh sumber tambahan.',
  'kbbi.source.raf555':
    'Cakupan KBBI VI dari APK resmi v6.1.0. Sering nemu kata yang sumber lain lewat.',
}

// Host + clickable URL per source. Domain shows in the row; the icon
// next to it copies the full URL so the admin can paste it into a browser
// or curl.
const KBBI_SOURCE_URL: Record<string, { host: string; url: string }> = {
  'kbbi.source.kemendikdasmen': {
    host: 'kbbi.kemendikdasmen.go.id',
    url: 'https://kbbi.kemendikdasmen.go.id/',
  },
  'kbbi.source.web_id': { host: 'kbbi.web.id', url: 'https://kbbi.web.id/' },
  'kbbi.source.typoonline': {
    host: 'typoonline.com',
    url: 'https://typoonline.com/kbbi/',
  },
  'kbbi.source.co_id': { host: 'kbbi.co.id', url: 'https://kbbi.co.id/' },
  'kbbi.source.raf555': {
    host: 'kbbi.raf555.dev',
    url: 'https://kbbi.raf555.dev/api/v1/entry/',
  },
}

function shortSourceLabel(label: string): string {
  return label.replace(/^Sumber:\s*/i, '')
}

function CopyUrlButton({ url, label }: { url: string; label: string }) {
  return (
    <CopyIconButton
      text={url}
      idleLabel={`Salin URL ${label}`}
      copiedLabel={`URL ${label} tersalin`}
      tone="indigo"
      className="p-1 text-[var(--ink-faint)] hover:bg-[var(--bg-cream)] hover:text-[var(--ink)]"
    />
  )
}

export function KbbiSourcesCard({ rows }: { rows: ConfigurationRow[] }) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: (input: { code: ConfigKey; value: unknown }) =>
      updateConfiguration({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configurations'] })
    },
  })

  return (
    <article
      className="soft-card flex flex-col gap-5 p-7"
      data-tone="blush"
      aria-label="Sumber KBBI"
    >
      <header className="flex flex-col gap-1">
        <span className="kicker text-[var(--ink-faint)]">
          evaluasi · kbbi
        </span>
        <h2 className="display-title text-[1.375rem] font-extrabold leading-tight text-[var(--ink)]">
          Sumber KBBI
        </h2>
        <p className="mt-1 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Setiap kata diverifikasi ke sumber yang aktif. Kalau salah satu
          kena rate-limit, CiteTrack pindah ke berikutnya.
        </p>
      </header>

      <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-white/60">
        {rows.map((row) => {
          const checked = row.value === 1
          const label = shortSourceLabel(row.label)
          const blurb = KBBI_SOURCE_BLURB[row.code] ?? row.description
          const link = KBBI_SOURCE_URL[row.code]
          const drifted = !row.isDefault
          return (
            <li
              key={row.code}
              className="flex items-center gap-5 px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[0.9375rem] font-semibold text-[var(--ink)]">
                    {label}
                  </p>
                  {drifted && (
                    <span
                      className="severity-badge"
                      data-severity="warning"
                    >
                      diubah
                    </span>
                  )}
                </div>
                <p
                  className="mt-0.5 text-[0.8125rem] leading-relaxed text-[var(--ink-soft)]"
                  title={row.description}
                >
                  {blurb}
                </p>
                {link && (
                  <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[0.75rem] text-[var(--ink-faint)]">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="underline-offset-2 hover:text-[var(--ink)] hover:underline"
                    >
                      {link.host}
                    </a>
                    <CopyUrlButton url={link.url} label={label} />
                    <span aria-hidden className="text-[var(--ink-faint)]/60">
                      ·
                    </span>
                    <span className="kicker normal-case tracking-normal">
                      bawaan{' '}
                      <span className="text-[var(--ink)]">
                        {row.defaultValue === 1 ? 'aktif' : 'nonaktif'}
                      </span>
                    </span>
                  </p>
                )}
              </div>
              <Switch
                id={`field-${row.code}`}
                aria-label={`Aktifkan ${label}`}
                checked={checked}
                disabled={mutation.isPending}
                onCheckedChange={(next) =>
                  mutation.mutate({ code: row.code, value: next ? 1 : 0 })
                }
              />
            </li>
          )
        })}
      </ul>

      {mutation.isError && (
        <p className="text-[0.8125rem] text-[var(--accent-coral-deep)]">
          {mutation.error instanceof Error
            ? mutation.error.message
            : 'Gagal menyimpan'}
        </p>
      )}
    </article>
  )
}
