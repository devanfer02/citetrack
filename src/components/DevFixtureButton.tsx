import { useState } from 'react'
import { FlaskConical } from 'lucide-react'
import { Button } from '#/components/ui/button'

interface DevFixtureButtonProps {
  onPickFile: (file: File) => void | Promise<void>
  label?: string
  disabled?: boolean
}

export function DevFixtureButton({
  onPickFile,
  label = 'Pakai thesis_example.pdf (dev)',
  disabled,
}: DevFixtureButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!import.meta.env.DEV) return null

    const handleClick = async () => {
      
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/dev-fixture')
      if (!res.ok) {
        throw new Error(`Fixture endpoint returned ${res.status}`)
      }
      const blob = await res.blob()
      const file = new File([blob], 'thesis_example.pdf', {
        type: 'application/pdf',
      })
      await onPickFile(file)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load dev fixture',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={handleClick}
        disabled={busy || disabled}
        className="kicker text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
      >
        <FlaskConical className="h-3.5 w-3.5" strokeWidth={1.75} />
        {busy ? 'Memuat fixture…' : label}
      </Button>
      {error && (
        <p className="text-[0.75rem] text-[var(--accent-coral-deep)]">{error}</p>
      )}
    </div>
  )
}
