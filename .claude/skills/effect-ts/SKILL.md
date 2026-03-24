---
name: effect-ts
description: Effect-TS patterns for typed error handling, services/layers, and generators. Use when writing or modifying services, API routes, actions, or any code using Effect.
user-invocable: false
---

# Effect-TS Reference (v3.x)

## The Effect Type

```typescript
Effect<Success, Error, Requirements>
//      ^        ^       ^
//      |        |       +-- Services/context needed (use `never` for none)
//      |        +---------- Typed error channel (use `never` for infallible)
//      +------------------- Success value type
```

An `Effect` is a lazy, immutable description of a computation. It does nothing until you run it.

## Creating Effects

### Effect.succeed / Effect.fail

```typescript
const success = Effect.succeed(42);
const failure = Effect.fail("something went wrong");
```

**IMPORTANT**: `Effect.succeed` evaluates eagerly. Never pass side-effectful expressions — use `Effect.sync` instead.

```typescript
// BAD — runs immediately
const bad = Effect.succeed(Date.now());
// GOOD — deferred
const good = Effect.sync(() => Date.now());
```

### Effect.try — Sync That May Throw

```typescript
const parsed = Effect.try({
  try: () => schema.parse(body),
  catch: (err) => new ValidationError({ errors: flattenErrors(err) }),
});
```

### Effect.tryPromise — Async That May Reject

```typescript
const result = Effect.tryPromise({
  try: () => fetch("/api/data").then((r) => r.json()),
  catch: (err) => new DatabaseError({ cause: err, message: "Failed" }),
});
```

## Generators (Effect.gen) — Primary Pattern

```typescript
const program = Effect.gen(function* () {
  const { db } = yield* Db;           // access service
  const user = yield* fetchUser(id);   // chain effects (short-circuits on fail)
  const posts = yield* fetchPosts(user.id);
  return { user, posts };
});
```

Use `yield*` (not `yield`). Execution stops on first failure.

## Typed Errors with Data.TaggedError

```typescript
import { Data } from "effect";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  cause: unknown;
  message: string;
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  id: number | string;
  entity: string;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  errors: Record<string, unknown>;
}> {}
```

Create instances: `new DatabaseError({ cause: err, message: "Failed" })`

## Error Handling

### Effect.catchTags — Handle Specific Errors by Tag (most common)

```typescript
program.pipe(
  Effect.catchTags({
    ValidationError: (err) =>
      Effect.succeed(response({ message: "Validation failed", error: err.errors }, HttpStatus.BAD_REQUEST)),
    NotFoundError: (err) =>
      Effect.succeed(response({ message: `${err.entity} not found` }, HttpStatus.NOT_FOUND)),
    DatabaseError: (err) =>
      Effect.succeed(response({ message: "Database error" }, HttpStatus.INTERNAL_SERVER_ERROR)),
  }),
);
```

### Effect.catchAll — Catch All Remaining Errors (fallback)

```typescript
program.pipe(
  Effect.catchAll((err) => {
    console.error("Unexpected error:", err);
    return Effect.succeed(response({ message: "Internal server error" }, HttpStatus.INTERNAL_SERVER_ERROR));
  }),
);
```

**Standard pattern**: `catchTags` first, then `catchAll`:

```typescript
myEffect.pipe(
  Effect.provide(DbLayer),
  Effect.catchTags({ ValidationError: ..., NotFoundError: ..., DatabaseError: ... }),
  Effect.catchAll((err) => { console.error("ERR:", err); return Effect.succeed(...); }),
);
```

### Effect.catchTag — Single Error Type

```typescript
program.pipe(
  Effect.catchTag("NotFoundError", (err) => Effect.succeed({ found: false })),
);
```

## Services and Layers (Dependency Injection)

### Define a Service

```typescript
import { Context, Layer } from "effect";

export class Db extends Context.Tag("Db")<Db, { db: typeof db }>() {}
export const DbLayer = Layer.succeed(Db, { db });
```

### Consume in Effect.gen

```typescript
const program = Effect.gen(function* () {
  const { db } = yield* Db;
  // use db...
});
```

### Provide Layers

```typescript
program.pipe(Effect.provide(DbLayer));
// Multiple: Effect.provide(Layer.merge(DbLayer, S3Layer))
```

## Running Effects

### Effect.runPromise — Primary Runner

```typescript
const result = await Effect.runPromise(program);
// Rejects if the Effect fails
```

**Call once at the edge** (route handler, server action), not inside services.

## Composition

### Effect.all — Parallel/Concurrent

```typescript
const [a, b] = yield* Effect.all([effectA, effectB], { concurrency: "unbounded" });

// Named results
const { user, posts } = yield* Effect.all({
  user: fetchUser(id),
  posts: fetchPosts(id),
});
```

### .pipe() — Chain Operations

```typescript
myEffect.pipe(
  Effect.map((value) => value * 2),
  Effect.flatMap((value) => anotherEffect(value)),
  Effect.provide(DbLayer),
  Effect.catchTags({ ... }),
);
```

### Effect.tap — Side Effect Without Changing Value

```typescript
fetchUser(id).pipe(
  Effect.tap((user) => Effect.sync(() => console.log("Got:", user.name))),
);
```

## Key Rules

1. **Never pass side effects to `Effect.succeed`** — use `Effect.sync` or `Effect.tryPromise`
2. **Always map errors in `Effect.tryPromise`** — use `{ try, catch }` overload for typed errors
3. **Use `yield*` (not `yield`)** inside `Effect.gen`
4. **Provide all Layers before `Effect.runPromise`** — compiler errors if missing
5. **`catchTags` before `catchAll`** — specific first, fallback last
6. **Service functions return `Effect`, not `Promise`** — caller decides when to run
7. **`Effect.runPromise` is the boundary** — call once at edge, not in services
