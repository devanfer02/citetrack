import { queryOptions } from '@tanstack/react-query'

export const citationsQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['pipeline', jobId, 'citations'] as const,
    queryFn: async () => {
      const { getCitationsForJob } = await import('#/services/parser/citations')
      return getCitationsForJob({ data: { jobId } })
    },
    staleTime: Infinity,
  })

export const referencesQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['pipeline', jobId, 'references'] as const,
    queryFn: async () => {
      const { getReferencesForJob } = await import('#/services/parser/references')
      return getReferencesForJob({ data: { jobId } })
    },
    staleTime: Infinity,
  })

export const matchesQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['pipeline', jobId, 'matches'] as const,
    queryFn: async () => {
      const { getMatchesForJob } = await import('#/services/matcher/matching')
      return getMatchesForJob({ data: { jobId } })
    },
    staleTime: Infinity,
  })

export const jobQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['pipeline', jobId, 'job'] as const,
    queryFn: async () => {
      const { getJob } = await import('#/services/pdf/upload')
      return getJob({ data: { jobId } })
    },
    staleTime: 30_000,
  })
