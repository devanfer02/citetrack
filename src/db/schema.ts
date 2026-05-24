import { sql } from 'drizzle-orm'
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea'
  },
})

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

export const pages = pgTable(
  'pages',
  {
    id: uuid().defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    pageNumber: integer('page_number').notNull(),
    content: text().notNull(),
    charCount: integer('char_count').notNull(),
    lowTextDensity: integer('low_text_density').default(0).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('pages_job_page_idx').on(t.jobId, t.pageNumber)],
)

export const citations = pgTable(
  'citations',
  {
    id: serial().primaryKey(),
    jobId: uuid('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    citationKey: text('citation_key').notNull(),
    thesisPage: integer('thesis_page').notNull(),
    thesisContext: text('thesis_context').notNull(),
    rawMatch: text('raw_match').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('citations_job_idx').on(t.jobId)],
)

export const references = pgTable(
  'references',
  {
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
  },
  (t) => [index('references_job_idx').on(t.jobId)],
)

export const matchTypeEnum = pgEnum('match_type', [
  'exact',
  'fuzzy',
  'unmatched',
])

export const citationMatches = pgTable(
  'citation_matches',
  {
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
  },
  (t) => [index('citation_matches_job_key_idx').on(t.jobId, t.citationKey)],
)

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
  'europepmc',
  'pubmed',
  'arxiv',
])

export const sourcePdfs = pgTable(
  'source_pdfs',
  {
    id: serial().primaryKey(),
    jobId: uuid('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    referenceId: integer('reference_id').references(() => references.id, {
      onDelete: 'cascade',
    }),
    filename: text(),
    pdfUrl: text('pdf_url'),
    fetchSource: fetchSourceEnum('fetch_source'),
    status: sourceFetchStatusEnum().default('pending').notNull(),
    totalPages: integer('total_pages'),
    error: text(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('source_pdfs_job_idx').on(t.jobId),
    index('source_pdfs_reference_idx').on(t.referenceId),
  ],
)

export const sourcePages = pgTable(
  'source_pages',
  {
    id: serial().primaryKey(),
    sourcePdfId: integer('source_pdf_id')
      .references(() => sourcePdfs.id, { onDelete: 'cascade' })
      .notNull(),
    pageNumber: integer('page_number').notNull(),
    content: text().notNull(),
    charCount: integer('char_count').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('source_pages_pdf_page_idx').on(t.sourcePdfId, t.pageNumber)],
)

export const sourceWindowEmbeddings = pgTable(
  'source_window_embeddings',
  {
    id: serial().primaryKey(),
    sourcePdfId: integer('source_pdf_id')
      .references(() => sourcePdfs.id, { onDelete: 'cascade' })
      .notNull(),
    pageNumber: integer('page_number').notNull(),
    windowIdx: integer('window_idx').notNull(),
    windowText: text('window_text').notNull(),
    embedding: bytea('embedding').notNull(),
    embeddingModel: text('embedding_model').notNull(),
    embeddingDim: integer('embedding_dim').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('source_window_embed_pdf_model_idx').on(
      t.sourcePdfId,
      t.embeddingModel,
    ),
    uniqueIndex('source_window_embed_unique_idx').on(
      t.sourcePdfId,
      t.embeddingModel,
      t.pageNumber,
      t.windowIdx,
    ),
  ],
)

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

export const evaluationJobStatusEnum = pgEnum('evaluation_job_status', [
  'pending',
  'extracting',
  'analyzing',
  'done',
  'failed',
])

export const evaluationJobs = pgTable('evaluation_jobs', {
  id: uuid().defaultRandom().primaryKey(),
  status: evaluationJobStatusEnum().default('pending').notNull(),
  filename: text().notNull(),
  fileSize: integer('file_size').notNull(),
  totalPages: integer('total_pages'),
  extractedPages: integer('extracted_pages').default(0).notNull(),
  currentStep: text('current_step'),
  kbbiProgress: integer('kbbi_progress').default(0).notNull(),
  kbbiTotal: integer('kbbi_total').default(0).notNull(),
  eydProgress: integer('eyd_progress').default(0).notNull(),
  eydTotal: integer('eyd_total').default(0).notNull(),
  durationMs: integer('duration_ms'),
  error: text(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const evaluationPages = pgTable(
  'evaluation_pages',
  {
    id: uuid().defaultRandom().primaryKey(),
    evalJobId: uuid('eval_job_id')
      .references(() => evaluationJobs.id, { onDelete: 'cascade' })
      .notNull(),
    pageNumber: integer('page_number').notNull(),
    content: text().notNull(),
    charCount: integer('char_count').notNull(),
    lowTextDensity: integer('low_text_density').default(0).notNull(),
    codeRanges: jsonb('code_ranges').$type<Array<[number, number]>>().default([]).notNull(),
    italicRanges: jsonb('italic_ranges').$type<Array<[number, number]>>().default([]).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('evaluation_pages_job_page_idx').on(t.evalJobId, t.pageNumber)],
)

export const evaluationCategoryEnum = pgEnum('evaluation_category', [
  'kbbi',
  'eyd',
])

export const evaluationSeverityEnum = pgEnum('evaluation_severity', [
  'error',
  'warning',
  'info',
])

export const evaluationFindings = pgTable(
  'evaluation_findings',
  {
    id: serial().primaryKey(),
    evalJobId: uuid('eval_job_id')
      .references(() => evaluationJobs.id, { onDelete: 'cascade' })
      .notNull(),
    category: evaluationCategoryEnum().notNull(),
    severity: evaluationSeverityEnum().default('warning').notNull(),
    pageNumber: integer('page_number'),
    offset: integer(),
    length: integer(),
    excerpt: text(),
    token: text(),
    message: text().notNull(),
    suggestion: text(),
    ruleId: text('rule_id'),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('evaluation_findings_job_page_idx').on(t.evalJobId, t.pageNumber),
    index('evaluation_findings_job_cat_sev_idx').on(
      t.evalJobId,
      t.category,
      t.severity,
    ),
  ],
)

export const evaluationSummary = pgTable('evaluation_summary', {
  evalJobId: uuid('eval_job_id')
    .references(() => evaluationJobs.id, { onDelete: 'cascade' })
    .primaryKey(),
  kbbiErrorCount: integer('kbbi_error_count').default(0).notNull(),
  eydErrorCount: integer('eyd_error_count').default(0).notNull(),
  overallScore: integer('overall_score').default(0).notNull(),
  rawReport: text('raw_report'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const vocabularyClassificationEnum = pgEnum('vocabulary_classification', [
  'indonesian',
  'english',
  'tech',
  'brand',
  'ignore',
  'typo',
])

export const evaluationVocabulary = pgTable('evaluation_vocabulary', {
  word: text().primaryKey(),
  classification: vocabularyClassificationEnum().notNull(),
  notes: text(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const configurations = pgTable('configurations', {
  code: text().primaryKey(),
  value: jsonb().notNull(),
  description: text(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const passageMatches = pgTable(
  'passage_matches',
  {
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
  },
  (t) => [
    index('passage_matches_job_idx').on(t.jobId),
    index('passage_matches_citation_idx').on(t.citationId),
  ],
)

export const passageBatchStatusEnum = pgEnum('passage_batch_status', [
  'pending',
  'running',
  'done',
  'failed',
])

export const passageMatchBatches = pgTable(
  'passage_match_batches',
  {
    id: serial().primaryKey(),
    jobId: uuid('job_id')
      .references(() => jobs.id, { onDelete: 'cascade' })
      .notNull(),
    batchIndex: integer('batch_index').notNull(),
    sourcePdfId: integer('source_pdf_id')
      .references(() => sourcePdfs.id, { onDelete: 'cascade' })
      .notNull(),
    status: passageBatchStatusEnum().default('pending').notNull(),
    citationCount: integer('citation_count').notNull(),
    matchedCount: integer('matched_count').default(0).notNull(),
    noMatchCount: integer('no_match_count').default(0).notNull(),
    attempts: integer().default(0).notNull(),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('passage_match_batches_job_batch_idx').on(
      t.jobId,
      t.batchIndex,
    ),
    index('passage_match_batches_job_status_idx').on(t.jobId, t.status),
  ],
)

export const apiCallOutcomeEnum = pgEnum('api_call_outcome', [
  'success',
  'http_error',
  'network_error',
  'timeout',
])

export const apiCallLogs = pgTable(
  'api_call_logs',
  {
    id: serial().primaryKey(),
    trackJobId: uuid('track_job_id').references(() => jobs.id, {
      onDelete: 'cascade',
    }),
    evalJobId: uuid('eval_job_id').references(() => evaluationJobs.id, {
      onDelete: 'cascade',
    }),
    provider: text().notNull(),
    method: text().notNull().default('GET'),
    url: text().notNull(),
    status: integer(),
    responseHeaders: jsonb('response_headers').$type<
      Record<string, string>
    >(),
    bodyPreview: text('body_preview'),
    bodyTruncated: boolean('body_truncated').default(false).notNull(),
    bodySizeBytes: integer('body_size_bytes'),
    outcome: apiCallOutcomeEnum().notNull(),
    errorMessage: text('error_message'),
    durationMs: integer('duration_ms').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('api_call_logs_created_idx').on(t.createdAt),
    index('api_call_logs_provider_created_idx').on(t.provider, t.createdAt),
    index('api_call_logs_track_job_idx').on(t.trackJobId),
    index('api_call_logs_eval_job_idx').on(t.evalJobId),
  ],
)
