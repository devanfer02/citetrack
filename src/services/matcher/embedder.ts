import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import {
  EMBEDDING_MODEL_VALUES,
  type EmbeddingModel,
} from '#/lib/configurations'
import { getConfig } from '#/services/configurations-cache'

interface ModelSpec {
  hfId: string
  dim: number
  // E5 models expect "query: " / "passage: " prefixes for asymmetric retrieval.
  // MiniLM treats queries and passages identically.
  usesE5Prefix: boolean
  // Inputs per ONNX inference call. The attention matrix is (seq × batch) so
  // unbounded batches blow up RAM on long PDFs; chunk before handing to the
  // pipeline. Smaller for the 768-dim base model.
  defaultBatchSize: number
}

const MODEL_SPECS: Record<Exclude<EmbeddingModel, 'none'>, ModelSpec> = {
  'paraphrase-minilm-l12-v2': {
    hfId: 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    dim: 384,
    usesE5Prefix: false,
    defaultBatchSize: 32,
  },
  'multilingual-e5-small': {
    hfId: 'Xenova/multilingual-e5-small',
    dim: 384,
    usesE5Prefix: true,
    defaultBatchSize: 32,
  },
  'multilingual-e5-base': {
    hfId: 'Xenova/multilingual-e5-base',
    dim: 768,
    usesE5Prefix: true,
    defaultBatchSize: 16,
  },
}

export interface EmbedOptions {
  /** Texts per ONNX call. Overrides the model's default batch size. */
  batchSize?: number
  /** Called after each chunk completes; useful for progress UI on long PDFs. */
  onChunk?: (done: number, total: number) => void
}

export class Embedder {
  readonly name: Exclude<EmbeddingModel, 'none'>
  readonly dim: number
  private readonly spec: ModelSpec
  private extractor: Promise<FeatureExtractionPipeline> | null = null

  constructor(name: Exclude<EmbeddingModel, 'none'>) {
    this.name = name
    this.spec = MODEL_SPECS[name]
    this.dim = this.spec.dim
  }

  private getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractor) {
      this.extractor = pipeline('feature-extraction', this.spec.hfId, {
        dtype: 'q8',
      }) as Promise<FeatureExtractionPipeline>
    }
    return this.extractor
  }

  async embedQueries(
    texts: string[],
    options: EmbedOptions = {},
  ): Promise<Float32Array[]> {
    return this.embedBatch(texts, 'query', options)
  }

  async embedPassages(
    texts: string[],
    options: EmbedOptions = {},
  ): Promise<Float32Array[]> {
    return this.embedBatch(texts, 'passage', options)
  }

  private async embedBatch(
    texts: string[],
    role: 'query' | 'passage',
    options: EmbedOptions,
  ): Promise<Float32Array[]> {
    if (texts.length === 0) return []

    const prepared = this.spec.usesE5Prefix
      ? texts.map((t) => `${role}: ${t}`)
      : texts

    const extractor = await this.getExtractor()
    const chunkSize = Math.max(
      1,
      options.batchSize ?? this.spec.defaultBatchSize,
    )

    const rows: Float32Array[] = Array.from<Float32Array>({
      length: texts.length,
    })
    let done = 0
    for (let start = 0; start < prepared.length; start += chunkSize) {
      const end = Math.min(prepared.length, start + chunkSize)
      const chunk = prepared.slice(start, end)
      const out = await extractor(chunk, {
        pooling: 'mean',
        normalize: true,
      })
      const flat = out.data as Float32Array
      for (let i = 0; i < chunk.length; i++) {
        rows[start + i] = flat.slice(i * this.dim, (i + 1) * this.dim)
      }
      done = end
      options.onChunk?.(done, prepared.length)
    }
    return rows
  }
}

const cache = new Map<EmbeddingModel, Embedder>()

export function makeEmbedder(name: EmbeddingModel): Embedder | null {
  if (name === 'none') return null
  const cached = cache.get(name)
  if (cached) return cached
  const fresh = new Embedder(name)
  cache.set(name, fresh)
  return fresh
}

export async function getConfiguredEmbedder(): Promise<Embedder | null> {
  const name = await getConfig('passage.embedding_model')
  return makeEmbedder(name)
}

export function listSupportedModels(): readonly EmbeddingModel[] {
  return EMBEDDING_MODEL_VALUES
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / Math.sqrt(na * nb)
}

// E5 outputs are already L2-normalized so dot == cosine. Use this when callers
// can guarantee that (faster: one multiply-add per dim).
export function dotProduct(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0
  let s = 0
  for (let i = 0; i < a.length; i++) s += a[i] * b[i]
  return s
}

export function float32ArrayToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
}

export function bufferToFloat32Array(buf: Buffer): Float32Array {
  // Copy out of the Node Buffer pool so the Float32Array owns clean storage.
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
  return new Float32Array(ab)
}
