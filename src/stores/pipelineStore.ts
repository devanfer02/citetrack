import { create } from 'zustand'
import type { PassageBatchSummary } from '#/services/ai/passages'

export interface CitationsPhaseData {
  totalCitations: number
  uniqueCitations: number
  citations: GroupedCitation[]
  durationMs?: number
}

export interface ReferencesPhaseData {
  totalReferences: number
  references: ParsedReference[]
  durationMs?: number
}

export interface MatchingPhaseData {
  matchSummary: MatchSummary
  durationMs?: number
}

export interface PassagesPhaseData {
  passageResults: PassageResult[]
  matched: number
  noSource: number
  noMatch: number
  total: number
  avgConfidence: number
  durationMs?: number
}

export interface PassageBatchProgress {
  startedAt: number
  batches: PassageBatchSummary[]
  results: PassageResult[]
}

export interface UploadPhaseData {
  totalPages: number
  durationMs?: number
}

export interface PipelineState {
  jobId: string | null
  currentPhase: PipelinePhase
  errorMessage: string | null
  upload: UploadPhaseData | null
  citations: CitationsPhaseData | null
  references: ReferencesPhaseData | null
  matching: MatchingPhaseData | null
  passages: PassagesPhaseData | null
  passageBatchProgress: PassageBatchProgress | null
}

export interface PipelineActions {
  setJobId: (jobId: string) => void
  setPhase: (phase: PipelinePhase) => void
  setError: (message: string) => void
  setUpload: (data: UploadPhaseData) => void
  setCitations: (data: CitationsPhaseData) => void
  setReferences: (data: ReferencesPhaseData) => void
  setMatching: (data: MatchingPhaseData) => void
  setPassages: (data: PassagesPhaseData) => void
  initPassageBatches: (
    batches: PassageBatchSummary[],
    noSourceResults: PassageResult[],
  ) => void
  updatePassageBatch: (
    batch: PassageBatchSummary,
    appendResults?: PassageResult[],
  ) => void
  replacePassageBatches: (batches: PassageBatchSummary[]) => void
  clearPassageBatchProgress: () => void
  reset: () => void
}

const initialState: PipelineState = {
  jobId: null,
  currentPhase: 'upload',
  errorMessage: null,
  upload: null,
  citations: null,
  references: null,
  matching: null,
  passages: null,
  passageBatchProgress: null,
}

export const usePipelineStore = create<PipelineState & PipelineActions>(
  (set) => ({
    ...initialState,
    setJobId: (jobId) => set({ jobId }),
    setPhase: (currentPhase) => set({ currentPhase }),
    setError: (errorMessage) => set({ errorMessage, currentPhase: 'error' }),
    setUpload: (upload) => set({ upload }),
    setCitations: (citations) => set({ citations }),
    setReferences: (references) => set({ references }),
    setMatching: (matching) => set({ matching }),
    setPassages: (passages) => set({ passages }),
    initPassageBatches: (batches, noSourceResults) =>
      set({
        passageBatchProgress: {
          startedAt: Date.now(),
          batches,
          results: [...noSourceResults],
        },
      }),
    updatePassageBatch: (batch, appendResults) =>
      set((state) => {
        const prev = state.passageBatchProgress
        if (!prev) return state
        const batches = prev.batches.map((b) =>
          b.batchIndex === batch.batchIndex ? batch : b,
        )
        const results = appendResults
          ? [...prev.results, ...appendResults]
          : prev.results
        return { passageBatchProgress: { ...prev, batches, results } }
      }),
    replacePassageBatches: (batches) =>
      set((state) => {
        const prev = state.passageBatchProgress
        if (!prev) return state
        return { passageBatchProgress: { ...prev, batches } }
      }),
    clearPassageBatchProgress: () => set({ passageBatchProgress: null }),
    reset: () => set(initialState),
  }),
)
