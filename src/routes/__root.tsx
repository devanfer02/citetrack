import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import ErrorPage from '../components/ErrorPage'
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
          'Upload your thesis PDF and trace every citation back to its exact page and passage in the source, across languages.',
      },
      {
        property: 'og:title',
        content: 'CiteTrack',
      },
      {
        property: 'og:description',
        content:
          'Trace every citation in your thesis back to the exact page and passage in its source paper.',
      },
      {
        property: 'og:type',
        content: 'website',
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
          'Trace every citation in your thesis back to the exact page and passage in its source paper.',
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
  errorComponent: ErrorPage,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
