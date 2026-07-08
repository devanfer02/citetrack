import { useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog'
import type { Finding } from '#/services/evaluation/apply/types'
import { ApplyPanel } from './apply-panel'

export function ApplyFixesDialog({
  evalJobId,
  findings,
}: {
  evalJobId: string
  findings: readonly Finding[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="whitespace-nowrap"
        >
          <Wand2 className="h-3.5 w-3.5" />
          <span>Terapkan perbaikan</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-[42rem] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Terapkan perbaikan</DialogTitle>
          <DialogDescription>
            Pilih perbaikan yang ingin diterapkan, lalu unduh dokumennya. Punya
            berkas .docx aslinya? Unggah di bawah supaya perbaikan ditulis ke
            dokumenmu tanpa mengubah format. Tanpa berkas, kami susun ulang
            .docx baru dari teks tesis.
          </DialogDescription>
        </DialogHeader>
        {open && <ApplyPanel evalJobId={evalJobId} findings={findings} />}
      </DialogContent>
    </Dialog>
  )
}
