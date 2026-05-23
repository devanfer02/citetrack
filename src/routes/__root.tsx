import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import Footer from '../components/Footer'
import Header from '../components/Header'

import TanStackQueryProvider from '../integrations/tanstack-query/root-provider'

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
        title: 'CiteTrack — Citation Tracer',
      },
    ],
    links: [
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
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased [overflow-wrap:anywhere] selection:bg-primary/20">
        <TanStackQueryProvider>
          <Header />
          {children}
          <Footer />
          {DevTools && (
            <Suspense>
              <DevTools />
            </Suspense>
          )}
        </TanStackQueryProvider>
        <Scripts />
      </body>
    </html>
  )
}
