import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

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
  },
  clientPrefix: "VITE_",
  client: {
    VITE_APP_ENV: z.enum(["local", "prod"]).default("local"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.NODE_ENV === "test",
});

// History and Settings are admin tools but stay accessible in every
// environment — there's no public-facing deployment that needs them hidden.
// VITE_APP_ENV is kept in the schema for future use but no longer gates routes.
export const isLocalEnv = true;

export function assertLocalOnly(): void {
  // Intentionally no-op: History and Settings are always reachable.
}
