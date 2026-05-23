import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    UNPAYWALL_EMAIL: z.string().email().optional(),
    CORE_API_KEY: z.string().min(1).optional(),
    SEMANTIC_SCHOLAR_API_KEY: z.string().min(1).optional(),
    NCBI_API_KEY: z.string().min(1).optional(),
  },
  clientPrefix: "VITE_",
  client: {
    VITE_APP_ENV: z.enum(["local", "prod"]).default("local"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.NODE_ENV === "test",
});

export const isLocalEnv = env.VITE_APP_ENV === "local";

export function assertLocalOnly(): void {
  if (!isLocalEnv) {
    throw new Error("Not found");
  }
}
