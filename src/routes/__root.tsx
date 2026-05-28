import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import Footer from '../components/Footer'
import Header from '../components/Header'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

const DevTools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-devtools').then((mod) => ({
        default: () => {
          const RouterDevtools = lazy(() =>
            import('@tanstack/react-router-devtools').then((m) => ({
              default: m.TanStackRouterDevtoolsPanel,
            })),
          )
          return (
            <mod.TanStackDevtools
              config={{ position: 'bottom-right' }}
              plugins={[
                {
                  name: 'Tanstack Router',
                  render: (
                    <Suspense>
                      <RouterDevtools />
                    </Suspense>
                  ),
                },
              ]}
            />
          )
        },
      })),
    )
  : null

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'CiteTrack',
      },
      {
        name: 'description',
        content:
          'Unggah PDF skripsi dan telusuri setiap sitasi sampai ke halaman dan kalimatnya di paper sumber, lintas bahasa.',
      },
      {
        property: 'og:title',
        content: 'CiteTrack',
      },
      {
        property: 'og:description',
        content:
          'Telusuri setiap sitasi di skripsimu sampai ke halaman dan kalimatnya di paper sumber.',
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        property: 'og:locale',
        content: 'id_ID',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
      {
        name: 'twitter:title',
        content: 'CiteTrack',
      },
      {
        name: 'twitter:description',
        content:
          'Telusuri setiap sitasi di skripsimu sampai ke halaman dan kalimatnya di paper sumber.',
      },
    ],
    links: [
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap',
      },
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased [overflow-wrap:anywhere] selection:bg-[var(--marker-yellow)] selection:text-[var(--ink)]">
        <Header />
        {children}
        <Footer />
        {DevTools && (
          <Suspense>
            <DevTools />
          </Suspense>
        )}
        <Scripts />
      </body>
    </html>
  )
}
