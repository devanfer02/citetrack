---
name: api-design
description: Design and implement TanStack Start API routes and server functions using Effect-TS. Use this skill when creating new API endpoints, server functions (actions), service layer functions, middleware, or any backend code that uses Effect-TS with TanStack Start. Also use when the user asks to add a new feature that requires a backend endpoint or server function.
---

# API Design — TanStack Start + Effect-TS

This skill guides the creation of type-safe, error-handling-first API routes and server functions
in the TelNetQuiz CMS using TanStack Start and Effect-TS.

## Architecture Overview

```
Client/Mobile → API Route (middleware stack) → Service Layer (Effect.gen) → Drizzle ORM → PostgreSQL
CMS Page → createServerFn → Service Layer (same) → Drizzle ORM → PostgreSQL
```

Two entry points, one service layer. API routes serve external clients (mobile app).
Server functions serve the CMS UI. Both use Effect-TS services underneath.

## File Locations

| Concern | Path |
|---------|------|
| API routes (external) | `src/routes/api/(internal)/` |
| Server functions (CMS) | `src/actions/` |
| Services | `src/services/` |
| Error definitions | `src/services/errors/errors.ts` |
| Zod schemas (CMS forms) | `src/types/zod.ts` |
| Zod schemas (API/mobile) | `src/types/zod.api.ts` |
| Middleware | `src/middlewares/` |
| HTTP utilities | `src/lib/http.ts` |
| DB setup + Layer | `src/lib/db.ts` |
| DB retry wrapper | `src/lib/retry.ts` |
| Error handler | `src/lib/sentry/effect.ts` |

## Creating an API Route

API routes live in `src/routes/api/(internal)/`. The parent route at `route.ts` applies
`sentryMiddleware → apiKeyMiddleware → loggerMiddleware` to all children.

### GET endpoint (no auth)

```typescript
import { createAPIFileRoute } from "@tanstack/react-start/api";

export const APIRoute = createAPIFileRoute("/api/(internal)/things")({
  GET: async ({ request }) =>
    Effect.runPromise(
      withApiErrorHandling(
        Effect.gen(function* () {
          const result = yield* fetchThings();
          return response({ message: "Things retrieved", data: result }, HttpStatus.OK);
        }).pipe(Effect.provide(DbLayer)),
      ),
    ),
});
```

### GET with route parameter

```typescript
export const APIRoute = createAPIFileRoute("/api/(internal)/things/$id")({
  GET: async ({ request, params }) =>
    Effect.runPromise(
      withApiErrorHandling(
        Effect.gen(function* () {
          const id = Number(params.id);
          if (Number.isNaN(id)) {
            return yield* Effect.fail(
              new ValidationError({ errors: { id: "Invalid ID" } }),
            );
          }
          const result = yield* fetchThingById(id);
          return response({ message: "Thing retrieved", data: result }, HttpStatus.OK);
        }).pipe(Effect.provide(DbLayer)),
      ),
    ),
});
```

### POST with body validation + auth

```typescript
export const APIRoute = createAPIFileRoute("/api/(internal)/things/create")({
  POST: {
    middleware: [authMiddleware],
    handler: async ({ request, context }) =>
      Effect.runPromise(
        withApiErrorHandling(
          Effect.gen(function* () {
            const body = yield* Effect.tryPromise(() => request.json());
            const data = yield* parseBody(createThingSchema, body);
            const result = yield* createThing(data, context.user.id);
            return response({ message: "Thing created", data: result }, HttpStatus.CREATED);
          }).pipe(Effect.provide(DbLayer)),
        ),
      ),
  },
});
```

### Multi-handler route (GET + POST)

```typescript
import { createHandlers } from "@/lib/middleware";

export const APIRoute = createAPIFileRoute("/api/(internal)/things")({
  ...createHandlers({
    GET: async ({ request }) =>
      Effect.runPromise(
        withApiErrorHandling(
          Effect.gen(function* () {
            const result = yield* fetchThings();
            return response({ message: "Things retrieved", data: result }, HttpStatus.OK);
          }).pipe(Effect.provide(DbLayer)),
        ),
      ),
    POST: {
      middleware: [authMiddleware],
      handler: async ({ request, context }) =>
        Effect.runPromise(
          withApiErrorHandling(
            Effect.gen(function* () {
              const body = yield* Effect.tryPromise(() => request.json());
              const data = yield* parseBody(createThingSchema, body);
              const result = yield* createThing(data, context.user.id);
              return response({ message: "Thing created", data: result }, HttpStatus.CREATED);
            }).pipe(Effect.provide(DbLayer)),
          ),
        ),
    },
  }),
});
```

## Creating a Server Function (CMS Action)

Server functions are for the CMS UI. They live in `src/actions/` and use `createServerFn`.

```typescript
import { createServerFn } from "@tanstack/react-start";

export const addThing = createServerFn({ method: "POST" })
  .inputValidator(thingSchema) // Zod schema from src/types/zod.ts
  .handler(async ({ data }) => {
    return Effect.runPromise(
      createThing(data).pipe(
        Effect.provide(DbLayer),
        Effect.catchAll((err) => {
          console.error("Failed to create thing. ERR:", err);
          return Effect.succeed(null); // null = error signal to CMS UI
        }),
      ),
    );
  });

export const removeThing = createServerFn({ method: "POST" })
  .inputValidator(z.number())
  .handler(async ({ data: id }) => {
    return Effect.runPromise(
      deleteThing(id).pipe(
        Effect.provide(DbLayer),
        Effect.catchAll((err) => {
          console.error("Failed to delete thing. ERR:", err);
          return Effect.succeed(null);
        }),
      ),
    );
  });
```

**Key difference from API routes:**
- Server functions use `Effect.catchAll` → return `null` on error (CMS handles via flash banner)
- API routes use `withApiErrorHandling` → return typed HTTP error responses

## Writing a Service Function

Services live in `src/services/`. Every function returns an Effect.

### Basic query

```typescript
export const fetchThingById = (id: number) =>
  Effect.gen(function* () {
    const { db } = yield* Db;

    const result = yield* dbTryPromise({
      try: () =>
        db.query.things.findFirst({
          where: eq(things.id, id),
        }),
      catch: (err) => new DatabaseError({ cause: err, message: "Failed to fetch thing" }),
    });

    if (result === undefined) {
      return yield* Effect.fail(new NotFoundError({ id, entity: "Thing" }));
    }

    return result;
  });
```

### Create with validation

```typescript
export const createThing = (data: ThingFormData) =>
  Effect.gen(function* () {
    const { db } = yield* Db;

    const [created] = yield* dbTryPromise({
      try: () =>
        db.insert(things).values({
          title: data.title,
          description: data.description,
        }).returning(),
      catch: (err) => new DatabaseError({ cause: err, message: "Failed to create thing" }),
    });

    return created;
  });
```

### Complex operation with multiple DB calls

```typescript
export const submitThingAnswers = (userId: string, data: SubmitData) =>
  Effect.gen(function* () {
    const { db } = yield* Db;

    // Step 1: Fetch related data
    const thing = yield* fetchThingById(data.thingId);

    // Step 2: Validate business rules
    if (thing.status !== "active") {
      return yield* Effect.fail(
        new ValidationError({ errors: { status: "Thing is not active" } }),
      );
    }

    // Step 3: Persist
    const [submission] = yield* dbTryPromise({
      try: () =>
        db.insert(submissions).values({
          userId,
          thingId: data.thingId,
          score: computedScore,
        }).returning(),
      catch: (err) => new DatabaseError({ cause: err, message: "Failed to submit" }),
    });

    return submission;
  });
```

## Error Handling

### Error types (defined in `src/services/errors/errors.ts`)

```typescript
DatabaseError   → 500 (logged to Sentry)
NotFoundError   → 404
ValidationError → 400 (includes field errors)
AuthError       → 401
```

### In API routes: use `withApiErrorHandling`

Wraps the entire Effect pipeline. Maps each TaggedError to an HTTP response automatically.
Never throw — errors flow through `Effect.fail()` and are caught by `Effect.catchTags`.

### In server functions: use `Effect.catchAll`

Return `null` to signal failure. The CMS UI handles error display.

## Zod Schemas

### API schemas (`src/types/zod.api.ts`) — snake_case for mobile

```typescript
export const createThingSchema = z.object({
  thing_name: z.string().min(3),
  category_id: z.number(),
});
```

### CMS form schemas (`src/types/zod.ts`) — camelCase with Indonesian messages

```typescript
export const thingSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter"),
  categoryId: z.number().min(1, "Pilih kategori"),
});
```

### Validation in routes

Use `parseBody(schema, body)` from `src/lib/http.ts`. It returns `Effect<T, ValidationError>`.

## Middleware

- **Parent route** (`route.ts`): `sentryMiddleware → apiKeyMiddleware → loggerMiddleware`
- **Per-handler**: Add `authMiddleware` for endpoints requiring user context
- Auth middleware injects `context.user` and `context.session`
- API key uses constant-time comparison (`timingSafeEqual`)

## Response Shape

All API responses follow a consistent shape:

```typescript
{ message: string, data?: T }           // Success
{ message: string, error?: unknown }    // Error (validation includes field details)
```

Use `response()` from `src/lib/http.ts` with `HttpStatus` constants.

## Checklist for New Endpoints

1. Define Zod schema in `src/types/zod.api.ts` (API) or `src/types/zod.ts` (CMS)
2. Write service function in `src/services/` using `Effect.gen` + `dbTryPromise`
3. Create route file in `src/routes/api/(internal)/` or action in `src/actions/`
4. Add `authMiddleware` if endpoint needs user context
5. Use `withApiErrorHandling` (API) or `Effect.catchAll` (server function)
6. Always `Effect.provide(DbLayer)` before `Effect.runPromise`
7. Return consistent `response({ message, data }, statusCode)` shape

## Common Mistakes to Avoid

- Never use try-catch in `Effect.gen` — use `Effect.tryPromise` or `dbTryPromise`
- Never throw inside a service — use `Effect.fail(new SomeError(...))`
- Never forget `Effect.provide(DbLayer)` — runtime will crash
- Never use `Effect.runSync` for async operations — always `Effect.runPromise`
- Don't mix camelCase/snake_case — API schemas are snake_case, CMS schemas are camelCase
- Don't add auth middleware to public endpoints (GET quiz data is public, POST submission needs auth)
