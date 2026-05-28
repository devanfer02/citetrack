export function EvaluationLoadingView() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-[88rem] flex-1 px-6 py-12 sm:px-10 sm:py-16">
      <header className="mb-10">
        <span className="kicker text-[var(--accent-coral-deep)]">
          Penilaian Skripsi
        </span>
        <h1 className="display-title mt-3 text-[clamp(2.25rem,3.6vw,3rem)] font-extrabold leading-[1.05] tracking-tight text-[var(--ink)]">
          Sedang membaca naskahmu
          <span className="dots-loop ml-1 text-[var(--accent-coral)]">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </h1>
        <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          Mengambil teks tiap halaman, lalu menjalankan pemeriksaan KBBI dan
          EYD. Biasanya selesai dalam beberapa detik, tergantung tebal
          skripsi.
        </p>
        <div className="editorial-rule mt-6" />
      </header>

      <section
        className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_28rem]"
        role="status"
        aria-live="polite"
      >
        <ol className="flex flex-col gap-5">
          <LoadingStep
            tone="info"
            label="Ekstrak"
            hint="Membaca teks dan tata letak tiap halaman."
            active
          />
          <LoadingStep
            tone="warning"
            label="KBBI"
            hint="Mencocokkan setiap kata ke Kamus Besar Bahasa Indonesia."
          />
          <LoadingStep
            tone="warning"
            label="EYD"
            hint="Memeriksa kapitalisasi, tanda baca, dan bentuk baku."
          />
        </ol>

        <aside
          aria-hidden
          className="doc-scan relative overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--marker-yellow)_60%,var(--line))] bg-[color-mix(in_oklab,var(--bg-butter)_45%,#ffffff)] p-7 shadow-[0_8px_24px_rgba(27,27,31,0.05)]"
        >
          <span className="kicker text-[var(--ink-faint)]">
            halaman demi halaman
          </span>
          <div className="mt-4 flex flex-col gap-3">
            <div className="h-3 w-5/6 rounded-full bg-[var(--ink)]/10" />
            <div className="h-3 w-3/4 rounded-full bg-[var(--ink)]/10" />
            <div className="h-3 w-full rounded-full bg-[var(--ink)]/10" />
            <div className="h-3 w-11/12 rounded-full bg-[var(--ink)]/10" />
            <div className="h-3 w-2/3 rounded-full bg-[var(--ink)]/10" />
            <div className="h-3 w-4/5 rounded-full bg-[var(--ink)]/10" />
            <div className="h-3 w-3/5 rounded-full bg-[var(--ink)]/10" />
          </div>
        </aside>
      </section>
    </main>
  )
}

function LoadingStep({
  tone,
  label,
  hint,
  active = false,
}: {
  tone: 'info' | 'warning' | 'error'
  label: string
  hint: string
  active?: boolean
}) {
  return (
    <li className="grid grid-cols-[3.5rem_1fr] gap-x-5">
      <span
        aria-hidden
        className="marginalia-rule mt-1 h-full w-px justify-self-end"
        data-severity={tone}
      />
      <div>
        <p className="inline-flex items-baseline gap-2">
          <span className="display-title text-lg font-extrabold leading-tight text-[var(--ink)]">
            {label}
          </span>
          {active && (
            <span className="kicker dots-loop text-[var(--accent-coral-deep)]">
              berjalan<span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          )}
        </p>
        <p className="mt-1 max-w-prose text-[0.9375rem] leading-relaxed text-[var(--ink-soft)]">
          {hint}
        </p>
      </div>
    </li>
  )
}
