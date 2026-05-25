import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const boolFromEnv = z
  .string()
  .optional()
  .transform((v) => v?.toLowerCase())
  .pipe(z.enum(["true", "false", "1", "0", ""]).optional())
  .transform((v) => v === "true" || v === "1");

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    UNPAYWALL_EMAIL: z.string().email().optional(),
    CORE_API_KEY: z.string().min(1).optional(),
    SEMANTIC_SCHOLAR_API_KEY: z.string().min(1).optional(),
    NCBI_API_KEY: z.string().min(1).optional(),
    KBBI_PROXY_URLS: z.string().optional(),
    KBBI_PROXY_LOCAL_ADDRS: z.string().optional(),
    TOR_SOCKS_HOST: z.string().optional(),
    TOR_SOCKS_PORT: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .pipe(z.number().int().positive().optional()),
    PUBLIC_MODE: boolFromEnv,
    MAX_CONCURRENT_JOBS: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 1))
      .pipe(z.number().int().positive()),
    MAX_PDF_PAGES: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 250))
      .pipe(z.number().int().positive()),
    JOB_RETENTION_DAYS: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : 7))
      .pipe(z.number().int().positive()),
    POLITE_POOL_EMAIL: z.string().email().optional(),
  },
  clientPrefix: "VITE_",
  client: {
    VITE_APP_ENV: z.enum(["local", "prod"]).default("local"),
    VITE_PUBLIC_MODE: boolFromEnv,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.NODE_ENV === "test",
});

// `PUBLIC_MODE=true` means "this CiteTrack is a shared public tool —
// hide history/settings/admin routes". Defaults to false so local
// docker compose up keeps everything visible.
//
// Two flags by design (defense in depth):
//   - `VITE_PUBLIC_MODE` is inlined into the client bundle and drives
//     the UI/UX gate (`isLocalEnv`): hides nav items and 404s in
//     `beforeLoad`. Visible to anyone with DevTools, tamperable.
//   - `PUBLIC_MODE` is server-only and drives `assertLocalOnly()`,
//     the real authorization check inside server functions. Cannot
//     be tampered from the browser.
// In deployment, set BOTH to the same value.
export const isLocalEnv = !env.VITE_PUBLIC_MODE;

export function assertLocalOnly(): void {
  if (env.PUBLIC_MODE) {
    throw new Error("Not Found");
  }
}
