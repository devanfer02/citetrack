import { z } from 'zod'

export const fetchSourceSchema = z.enum([
  'doi',
  'unpaywall',
  'semantic-scholar',
  'manual',
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
