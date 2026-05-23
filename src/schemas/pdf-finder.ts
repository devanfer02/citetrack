import { z } from 'zod'

export const fetchSourceSchema = z.enum([
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
export type FetchSource = z.infer<typeof fetchSourceSchema>

export const pdfFindResultSchema = z.object({
  url: z.string().url(),
  source: fetchSourceSchema,
})
export type PdfFindResult = z.infer<typeof pdfFindResultSchema>

export const unpaywallResponseSchema = z.object({
  best_oa_location: z
    .object({
      url_for_pdf: z.string().url().nullable(),
      url: z.string().url().nullable(),
    })
    .nullable(),
})

export const semanticScholarResponseSchema = z.object({
  data: z
    .array(
      z.object({
        paperId: z.string(),
        title: z.string(),
        isOpenAccess: z.boolean().optional(),
        openAccessPdf: z
          .object({
            url: z.string().url(),
          })
          .nullable()
          .optional(),
      }),
    )
    .optional()
    .default([]),
})

export const crossRefResponseSchema = z.object({
  message: z.object({
    link: z
      .array(
        z.object({
          URL: z.string().url(),
          'content-type': z.string().optional(),
        }),
      )
      .optional()
      .default([]),
    resource: z
      .object({
        primary: z.object({ URL: z.string().url() }).optional(),
      })
      .optional(),
  }),
})

export const openAlexWorkSchema = z.object({
  open_access: z
    .object({
      is_oa: z.boolean().optional(),
      oa_url: z.string().url().nullable().optional(),
    })
    .optional(),
  primary_location: z
    .object({
      pdf_url: z.string().url().nullable().optional(),
      landing_page_url: z.string().url().nullable().optional(),
    })
    .nullable()
    .optional(),
})

export const openAlexSearchSchema = z.object({
  results: z.array(openAlexWorkSchema).optional().default([]),
})

export const coreSearchSchema = z.object({
  results: z
    .array(
      z.object({
        title: z.string().optional(),
        downloadUrl: z.string().url().nullable().optional(),
        sourceFulltextUrls: z.array(z.string().url()).optional().default([]),
      }),
    )
    .optional()
    .default([]),
})

export const europePmcResponseSchema = z.object({
  resultList: z
    .object({
      result: z
        .array(
          z.object({
            fullTextUrlList: z
              .object({
                fullTextUrl: z
                  .array(
                    z.object({
                      url: z.string().url(),
                      documentStyle: z.string().optional(),
                      availability: z.string().optional(),
                    }),
                  )
                  .optional()
                  .default([]),
              })
              .optional(),
          }),
        )
        .optional()
        .default([]),
    })
    .optional(),
})

export const pubMedEsearchSchema = z.object({
  esearchresult: z
    .object({
      idlist: z.array(z.string()).optional().default([]),
    })
    .optional(),
})
