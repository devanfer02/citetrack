import {
  integer,
  pgEnum,
  pgTable,
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
