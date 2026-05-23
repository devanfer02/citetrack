type UploadState =
  | { step: 'idle' }
  | { step: 'selected'; file: File }
  | { step: 'uploading'; file: File; progress: number }
  | { step: 'extracting'; file: File; jobId: string }
  | {
      step: 'done'
      file: File
      jobId: string
      totalPages: number
      extractedPages: number
      scannedWarning: boolean
    }
  | { step: 'error'; file: File | null; message: string }
