import { createFileRoute } from '@tanstack/react-router'
import { Github, Linkedin } from 'lucide-react'

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

const SOURCE_URL = 'https://github.com/devanfer02/citetrack'
const CREATOR_LINKEDIN_URL = 'https://www.linkedin.com/in/dvnnfrr/'

function PrivacyPage() {
  return (
    <main className="w-full flex-1 px-4 pb-16 pt-10">
      <article className="mx-auto max-w-3xl">
        <header className="mb-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Legal
          </p>
          <h1 className="display-title mb-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: April 19, 2026
          </p>
        </header>

        <div className="flex flex-col gap-8 text-sm leading-relaxed text-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold">Who we are</h2>
            <p className="m-0 text-muted-foreground">
              CiteTrack is an academic tool built to help FILKOM students
              trace citations and evaluate the writing quality of their
              thesis drafts. It is developed as an open academic project and
              is not a commercial service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">What we collect</h2>
            <ul className="m-0 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="font-semibold text-foreground">
                  Uploaded PDFs.
                </strong>{' '}
                The thesis and source PDFs you upload are stored so we can
                run the tracing and evaluation pipelines and let you revisit
                past jobs from the History page.
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  Extracted text and metadata.
                </strong>{' '}
                Citations, references, matches, and page-level passages
                derived from your PDFs are persisted in our database tied to
                the job id in your URL.
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  Minimal technical data.
                </strong>{' '}
                Standard request logs (timestamps, error traces) to operate
                the service. No analytics or tracking pixels.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">How we use it</h2>
            <p className="m-0 text-muted-foreground">
              Your data is used only to run the pipelines you invoke —
              citation parsing, reference parsing, matching, source fetching,
              passage tracing, and EYD / KBBI / template evaluation — and to
              render those results back to you. We do not sell your data, we
              do not use it for advertising, and we do not use it to train
              machine-learning models.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Third-party services</h2>
            <p className="mb-2 text-muted-foreground">
              Some pipeline steps rely on third-party services. When you
              invoke them, the minimum necessary data is sent:
            </p>
            <ul className="m-0 list-disc space-y-2 pl-5 text-muted-foreground">
              <li>
                <strong className="font-semibold text-foreground">
                  Anthropic (Claude API).
                </strong>{' '}
                Passage matching may send citation snippets and source PDF
                text to Claude. Usage is governed by Anthropic&apos;s own
                privacy policy.
              </li>
              <li>
                <strong className="font-semibold text-foreground">
                  Public paper repositories.
                </strong>{' '}
                Source-PDF fetching queries public academic search APIs
                (e.g. CrossRef, arXiv) using reference metadata only.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Retention and deletion</h2>
            <p className="m-0 text-muted-foreground">
              Jobs and their associated PDFs remain available via the
              History page so you can revisit earlier analyses. If you want
              a job permanently deleted, contact the maintainer and include
              the job id from the URL.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Source code</h2>
            <p className="mb-4 text-muted-foreground">
              CiteTrack is open source. You can inspect the full
              implementation — including how PDFs are parsed, stored, and
              sent to third-party services — directly in the repository:
            </p>
            <a
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-medium text-foreground no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] transition-colors hover:bg-primary/5"
            >
              <Github className="h-4 w-4" strokeWidth={1.75} />
              {SOURCE_URL.replace('https://', '')}
            </a>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold">Contact</h2>
            <p className="mb-4 text-muted-foreground">
              Questions, deletion requests, or security reports: open an
              issue on the{' '}
              <a
                href={`${SOURCE_URL}/issues`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                GitHub repository
              </a>{' '}
              or reach out to the creator directly:
            </p>
            <a
              href={CREATOR_LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--chip-line)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-medium text-foreground no-underline shadow-[0_8px_24px_rgba(30,90,72,0.08)] transition-colors hover:bg-primary/5"
            >
              <Linkedin className="h-4 w-4" strokeWidth={1.75} />
              linkedin.com/in/dvnnfrr
            </a>
          </section>
        </div>
      </article>
    </main>
  )
}
