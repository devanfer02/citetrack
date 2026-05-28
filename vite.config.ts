import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { nitro } from 'nitro/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// impit is a native (NAPI) module loaded via dynamic import in the KBBI
// typoonline source. Bundling it makes rollup try to inline the platform `.node`
// ELF binary ("Unexpected character '\u{7f}'"). `ssr.external` alone doesn't
// cover every build pass, so mark impit, its per-platform packages, and any
// `.node` file external in all rollup passes via a pre-resolve plugin — Node
// then resolves the right binary at runtime.
const externalizeNativeImpit = {
  name: 'externalize-native-impit',
  enforce: 'pre' as const,
  resolveId(source: string) {
    if (
      source === 'impit' ||
      source.startsWith('impit-') ||
      source.endsWith('.node')
    ) {
      return { id: source, external: true }
    }
    return null
  },
}

const config = defineConfig({
  plugins: [
    externalizeNativeImpit,
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
    external: ['pdfjs-dist', 'impit'],
  },
})

export default config
