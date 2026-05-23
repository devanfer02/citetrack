import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    MATCHER_STRATEGY: z.enum(['api', 'agent']).optional().default('agent'),
    UNPAYWALL_EMAIL: z.string().email().optional(),
  },
  clientPrefix: "VITE_",
  client: {},
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  skipValidation: process.env.NODE_ENV === "test",
});
