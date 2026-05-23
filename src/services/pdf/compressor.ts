import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

type CompressionQuality = 'screen' | 'ebook' | 'printer' | 'prepress'

const QUALITY_MAP: Record<CompressionQuality, string> = {
  screen: '/screen',
  ebook: '/ebook',
  printer: '/printer',
  prepress: '/prepress',
}

export async function compressPdf(
  inputPath: string,
  outputPath: string,
  quality: CompressionQuality = 'ebook',
): Promise<{ originalSize: number; compressedSize: number; ratio: number }> {
  const originalStat = await stat(inputPath)
  const originalSize = originalStat.size

  await execFileAsync('gs', [
    '-sDEVICE=pdfwrite',
    `-dPDFSETTINGS=${QUALITY_MAP[quality]}`,
    '-dNOPAUSE',
    '-dBATCH',
    '-dQUIET',
    '-dCompatibilityLevel=1.5',
    `-sOutputFile=${outputPath}`,
    inputPath,
  ])

  const compressedStat = await stat(outputPath)
  const compressedSize = compressedStat.size

  const ratio =
    originalSize > 0
      ? Math.round((1 - compressedSize / originalSize) * 100)
      : 0

  return { originalSize, compressedSize, ratio }
}
