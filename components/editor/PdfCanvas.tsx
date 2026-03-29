'use client'

import { useAppStore } from '@/lib/store'
import { Spinner } from '@/components/ui/Spinner'

interface PdfCanvasProps {
  pageNumber: number
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function PdfCanvas({ pageNumber, containerRef }: PdfCanvasProps) {
  const pages = useAppStore((s) => s.pages)
  const page = pages.find((p) => p.pageNumber === pageNumber)

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={page.dataUrl}
        alt={`Seite ${pageNumber}`}
        className="w-full rounded shadow-md"
        draggable={false}
      />
    </div>
  )
}
