import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
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

export const sourceFetchStatusEnum = pgEnum('source_fetch_status', [
  'pending',
  'found',
  'downloading',
  'extracting',
  'done',
  'failed',
])

export const fetchSourceEnum = pgEnum('fetch_source', [
  'doi',
  'unpaywall',
  'semantic-scholar',
  'crossref',
  'openalex',
  'core',
  'manual',
])

export const sourcePdfs = pgTable('source_pdfs', {
  id: serial().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  referenceId: integer('reference_id')
    .references(() => references.id, { onDelete: 'cascade' })
    .notNull(),
  pdfUrl: text('pdf_url'),
  fetchSource: fetchSourceEnum('fetch_source'),
  status: sourceFetchStatusEnum().default('pending').notNull(),
  totalPages: integer('total_pages'),
  error: text(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const sourcePages = pgTable('source_pages', {
  id: serial().primaryKey(),
  sourcePdfId: integer('source_pdf_id')
    .references(() => sourcePdfs.id, { onDelete: 'cascade' })
    .notNull(),
  pageNumber: integer('page_number').notNull(),
  content: text().notNull(),
  charCount: integer('char_count').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const dictionary = pgTable(
  'dictionary',
  {
    id: serial().primaryKey(),
    word: text().notNull(),
    arti: text(),
    type: integer(),
  },
  (t) => [
    index('dictionary_word_lookup_idx').on(sql`lower(trim(${t.word}))`),
  ],
)

export const dictionaryCache = pgTable('dictionary_cache', {
  word: text().primaryKey(),
  found: boolean().notNull(),
  source: text(),
  arti: text(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
})

export const passageMatches = pgTable('passage_matches', {
  id: serial().primaryKey(),
  jobId: uuid('job_id')
    .references(() => jobs.id, { onDelete: 'cascade' })
    .notNull(),
  citationId: integer('citation_id')
    .references(() => citations.id, { onDelete: 'cascade' })
    .notNull(),
  sourcePdfId: integer('source_pdf_id')
    .references(() => sourcePdfs.id, { onDelete: 'cascade' })
    .notNull(),
  sourcePage: integer('source_page').notNull(),
  matchedPassage: text('matched_passage').notNull(),
  confidence: real().default(0).notNull(),
  reasoning: text(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})
