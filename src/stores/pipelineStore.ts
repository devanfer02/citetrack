import { create } from 'zustand'

export interface CitationsPhaseData {
  totalCitations: number
  uniqueCitations: number
  citations: GroupedCitation[]
}

export interface ReferencesPhaseData {
  totalReferences: number
  references: ParsedReference[]
}

export interface MatchingPhaseData {
  matchSummary: MatchSummary
}

export interface SourcesPhaseData {
  sourceResults: SourceFetchResult[]
  found: number
  failed: number
  total: number
}

export interface PassagesPhaseData {
  passageResults: PassageResult[]
  matched: number
  noSource: number
  noMatch: number
  total: number
  avgConfidence: number
  matcherStrategy: 'none' | 'api' | 'agent'
}

export interface PipelineState {
  jobId: string | null
  currentPhase: PipelinePhase
  errorMessage: string | null
  citations: CitationsPhaseData | null
  references: ReferencesPhaseData | null
  matching: MatchingPhaseData | null
  sources: SourcesPhaseData | null
  passages: PassagesPhaseData | null
}

export interface PipelineActions {
  setJobId: (jobId: string) => void
  setPhase: (phase: PipelinePhase) => void
  setError: (message: string) => void
  setCitations: (data: CitationsPhaseData) => void
  setReferences: (data: ReferencesPhaseData) => void
  setMatching: (data: MatchingPhaseData) => void
  setSources: (data: SourcesPhaseData) => void
  setPassages: (data: PassagesPhaseData) => void
  reset: () => void
}

const initialState: PipelineState = {
  jobId: null,
  currentPhase: 'upload',
  errorMessage: null,
  citations: null,
  references: null,
  matching: null,
  sources: null,
  passages: null,
}

export const usePipelineStore = create<PipelineState & PipelineActions>((set) => ({
  ...initialState,
  setJobId: (jobId) => set({ jobId }),
  setPhase: (currentPhase) => set({ currentPhase }),
  setError: (errorMessage) => set({ errorMessage, currentPhase: 'error' }),
  setCitations: (citations) => set({ citations }),
  setReferences: (references) => set({ references }),
  setMatching: (matching) => set({ matching }),
  setSources: (sources) => set({ sources }),
  setPassages: (passages) => set({ passages }),
  reset: () => set(initialState),
}))
