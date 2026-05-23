import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { nitro } from 'nitro/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  plugins: [
    devtools(),
    nitro(),
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  // pdfjs-dist must stay external so the server can resolve its own
  // ./pdf.worker.mjs at runtime. If it's bundled, Nitro flattens pdfjs into
  // _libs/pdfjs-dist.mjs and the worker's relative import fails with
  // "Setting up fake worker failed".
  ssr: {
    external: ['pdfjs-dist'],
  },
})

export default config
