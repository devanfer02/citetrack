import {
  integer,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'extracting',
  'done',
  'failed',
])

export const jobs = pgTable('jobs', {
  id: uuid().defaultRandom().primaryKey(),
  status: jobStatusEnum().default('pending').notNull(),
  filename: text().notNull(),
  fileSize: integer('file_size').notNull(),
  totalPages: integer('total_pages'),
  extractedPages: integer('extracted_pages').default(0).notNull(),
  error: text(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const pages = pgTable('pages', {
  id: uuid().defaultRandom().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  pageNumber: integer('page_number').notNull(),
  content: text().notNull(),
  charCount: integer('char_count').notNull(),
  lowTextDensity: integer('low_text_density').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const citations = pgTable('citations', {
  id: serial().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  citationKey: text('citation_key').notNull(),
  thesisPage: integer('thesis_page').notNull(),
  thesisContext: text('thesis_context').notNull(),
  rawMatch: text('raw_match').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const references = pgTable('references', {
  id: serial().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  author: text().notNull(),
  year: text().notNull(),
  title: text().notNull(),
  doi: text(),
  url: text(),
  publisher: text(),
  journal: text(),
  rawText: text('raw_text').notNull(),
  startPage: integer('start_page'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const matchTypeEnum = pgEnum('match_type', [
  'exact',
  'fuzzy',
  'unmatched',
])

export const citationMatches = pgTable('citation_matches', {
  id: serial().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  citationKey: text('citation_key').notNull(),
  referenceId: integer('reference_id').references(() => references.id, {
    onDelete: 'set null',
  }),
  confidence: real().default(0).notNull(),
  matchType: matchTypeEnum('match_type').default('unmatched').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
