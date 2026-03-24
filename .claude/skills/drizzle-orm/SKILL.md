---
name: drizzle-orm
description: Drizzle ORM patterns for PostgreSQL schema definition, relations, queries, and mutations. Use when writing or modifying database schema, services, or any code interacting with the database.
user-invocable: false
---

# Drizzle ORM Reference (PostgreSQL)

## Schema Definition — pgTable

Tables are defined in `src/database/schema.ts`.

```typescript
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  unique,
} from "drizzle-orm/pg-core";

// Reusable timestamps helper
export const timestamps = {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
};

export const chapters = pgTable("chapters", {
  id: serial().primaryKey(),
  title: varchar().notNull(),
  description: text().notNull(),
  mascotId: integer().notNull(),
  ...timestamps,
});

export const quizzes = pgTable(
  "quizzes",
  {
    id: serial().primaryKey(),
    chapterId: integer()
      .references(() => chapters.id, { onDelete: "cascade" })
      .notNull(),
    title: varchar().notNull(),
    level: integer().notNull(),
    difficulty: varchar({ enum: ["easy", "medium", "hard"] }).notNull(),
    ...timestamps,
  },
  (t) => [unique("levels_quiz_unique").on(t.id, t.level)],
);
```

### Common Column Types

| Type | Usage |
|------|-------|
| `serial()` | Auto-incrementing integer (primary key) |
| `integer()` | Integer |
| `varchar()` | Variable-length string |
| `varchar({ enum: [...] })` | String with allowed values |
| `text()` | Unlimited text |
| `boolean()` | Boolean |
| `timestamp()` | Timestamp |
| `timestamp("col_name")` | Timestamp with custom column name |

### Column Modifiers

```typescript
.primaryKey()                              // Primary key
.notNull()                                 // NOT NULL
.default(value)                            // Default value
.defaultNow()                              // DEFAULT NOW() (timestamps)
.references(() => otherTable.id)           // Foreign key
.references(() => otherTable.id, { onDelete: "cascade" })  // With cascade
```

### Table Constraints (3rd argument)

```typescript
pgTable("name", { columns }, (t) => [
  unique("constraint_name").on(t.col1, t.col2),  // Unique constraint
]);
```

## Relations

Relations are defined separately from tables, at the bottom of `schema.ts`.

```typescript
import { relations } from "drizzle-orm";

export const chaptersRelations = relations(chapters, ({ many }) => ({
  quizzes: many(quizzes),
  questions: many(questions),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  chapter: one(chapters, {
    fields: [quizzes.chapterId],
    references: [chapters.id],
  }),
  questions: many(questions),
}));
```

### Relation Types

- `one(targetTable, { fields: [thisTable.fk], references: [targetTable.pk] })` — belongs-to
- `many(targetTable)` — has-many (no fields/references needed)

## Queries — Relational Query API

Use `db.query.<table>` for queries with relations. This is the preferred query method.

### findMany

```typescript
const allQuizzes = await db.query.quizzes.findMany({
  where: eq(quizzes.chapterId, chapterId),
  with: {
    chapter: true,          // eager load relation
    questions: true,        // eager load relation
  },
  orderBy: [desc(quizzes.createdAt)],
  limit: 10,
  offset: 0,
});
```

### findFirst

```typescript
const quiz = await db.query.quizzes.findFirst({
  where: eq(quizzes.id, id),
  with: {
    questions: {
      with: { options: true },  // nested eager loading
    },
  },
  extras: {
    numberOfQuestions: sql<number>`(
      SELECT count(*) FROM questions WHERE "quizId" = quizzes.id
    )`.as("numberOfQuestions"),
  },
});
// Returns undefined if not found
```

### extras — Computed SQL Columns

```typescript
extras: {
  fieldName: sql<ReturnType>`(SQL expression)`.as("aliasName"),
}
```

## Select / Insert / Update / Delete — SQL-like API

### Select

```typescript
const rows = await db.select().from(chapters);

// With specific columns
const rows = await db
  .select({ id: chapters.id, title: chapters.title })
  .from(chapters)
  .where(eq(chapters.id, 1));

// With joins
const rows = await db
  .select()
  .from(quizzes)
  .leftJoin(chapters, eq(quizzes.chapterId, chapters.id))
  .where(eq(chapters.id, chapterId));

// With aggregation
const rows = await db
  .select({
    chapterId: quizzes.chapterId,
    count: sql<number>`count(*)`,
  })
  .from(quizzes)
  .groupBy(quizzes.chapterId);
```

### Insert

```typescript
// Single insert
const [created] = await db
  .insert(quizzes)
  .values({
    title: "New Quiz",
    chapterId: 1,
    level: 1,
    difficulty: "easy",
  })
  .returning();  // Returns the inserted row

// Multi insert
const created = await db
  .insert(options)
  .values([
    { questionId: 1, text: "Option A", isCorrect: true },
    { questionId: 1, text: "Option B", isCorrect: false },
  ])
  .returning();
```

### Update

```typescript
const [updated] = await db
  .update(quizzes)
  .set({
    title: "Updated Title",
    updatedAt: new Date(),
  })
  .where(eq(quizzes.id, id))
  .returning();
// Returns empty array if no rows matched
```

### Delete

```typescript
await db
  .delete(quizzes)
  .where(eq(quizzes.id, id));

// Delete with returning
const [deleted] = await db
  .delete(quizzes)
  .where(eq(quizzes.id, id))
  .returning();
```

## Operators and Filters

```typescript
import { eq, ne, gt, gte, lt, lte, and, or, inArray, like, isNull, isNotNull, desc, asc, sql, count } from "drizzle-orm";

// Equality
where: eq(table.col, value)

// Multiple conditions
where: and(
  eq(quizzes.chapterId, chapterId),
  eq(quizzes.difficulty, "hard"),
)

// OR conditions
where: or(
  eq(quizzes.difficulty, "easy"),
  eq(quizzes.difficulty, "medium"),
)

// IN array
where: inArray(quizzes.id, [1, 2, 3])

// LIKE
where: like(chapters.title, "%geometry%")

// NULL checks
where: isNull(table.deletedAt)
where: isNotNull(table.email)

// Ordering
orderBy: [desc(table.createdAt), asc(table.id)]

// Aggregate functions
sql<number>`count(*)`
sql<number>`avg(${table.score})`
sql<number>`sum(${table.points})`
```

## SQL Template Tag

For raw SQL expressions:

```typescript
import { sql } from "drizzle-orm";

// In extras
extras: {
  total: sql<number>`(SELECT count(*) FROM questions WHERE "quizId" = ${quizzes.id})`.as("total"),
}

// In where
where: sql`${table.createdAt} > now() - interval '7 days'`

// Column reference in template
sql`count(${quizzes.id})`
```

## Migrations

```bash
bun run db:generate  # Generate migration SQL from schema changes
bun run db:push      # Push migrations to database
bun run db:migrate   # Generate + push (shortcut)
```

### drizzle.config.ts

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/database/schema.ts",
  out: "./src/database/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

## Integration with Effect-TS

In this project, all Drizzle calls are wrapped in Effect via `dbTryPromise`:

```typescript
import { Db, dbTryPromise } from "@/lib/db";  // or "@/lib/retry"
import { DatabaseError, NotFoundError } from "@/services/errors/errors";

export const fetchQuizById = (id: number) =>
  Effect.gen(function* () {
    const { db } = yield* Db;

    const result = yield* dbTryPromise({
      try: () =>
        db.query.quizzes.findFirst({
          where: eq(quizzes.id, id),
          with: { questions: true },
        }),
      catch: (err) =>
        new DatabaseError({ cause: err, message: `Failed to fetch quiz ${id}` }),
    });

    if (result === undefined) {
      return yield* Effect.fail(new NotFoundError({ id, entity: "Quiz" }));
    }

    return result;
  });
```

### CRUD Pattern Summary

| Operation | Drizzle API | Return |
|-----------|------------|--------|
| Fetch all | `db.query.table.findMany({ with, where, orderBy })` | Array (empty if none) |
| Fetch one | `db.query.table.findFirst({ where, with })` | Object or `undefined` |
| Create | `db.insert(table).values(data).returning()` | Array with inserted row |
| Update | `db.update(table).set(data).where(eq(...)).returning()` | Array (empty if no match) |
| Delete | `db.delete(table).where(eq(...))` | void (or `.returning()`) |
