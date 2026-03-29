'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/upload/DropZone'
import { ExtractionProgress } from '@/components/upload/ExtractionProgress'
import { Spinner } from '@/components/ui/Spinner'
import { uploadPdf } from '@/actions/upload'
import { extractProducts } from '@/actions/extract'
import { renderPdfPages } from '@/lib/pdf-client'
import { useAppStore } from '@/lib/store'
import { toast } from '@/lib/toast'

type Status =
  | { type: 'idle' }
  | { type: 'uploading' }
  | { type: 'rendering' }
  | { type: 'extracting'; current: number; total: number }
  | { type: 'error'; message: string }

export function UploadContent() {
  const router = useRouter()
  const { setSession, setPages, setProducts } = useAppStore()
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  const handleFile = useCallback(async (file: File) => {
    setStatus({ type: 'uploading' })

    // 1. PDF hochladen
    const formData = new FormData()
    formData.append('pdf', file)
    const uploadResult = await uploadPdf(formData)
    if (!uploadResult.success) {
      setStatus({ type: 'error', message: uploadResult.error })
      toast.error(uploadResult.error)
      return
    }

    const { sessionId, pdfBlobUrl } = uploadResult.data
    setSession(sessionId, pdfBlobUrl)

    // 2. PDF client-seitig rendern
    setStatus({ type: 'rendering' })
    const pdfBuffer = await file.arrayBuffer()
    const pages = await renderPdfPages(pdfBuffer, (current, total) => {
      setStatus({ type: 'extracting', current, total })
    })
    setPages(pages)

    // 3. Produkte per Claude extrahieren
    setStatus({ type: 'extracting', current: 0, total: pages.length })
    const extractResult = await extractProducts(sessionId, pages)
    if (!extractResult.success) {
      setStatus({ type: 'error', message: extractResult.error })
      toast.error(extractResult.error)
      return
    }

    if (extractResult.products.length === 0) {
      setStatus({ type: 'error', message: 'Keine Produkte im PDF erkannt.' })
      toast.error('Keine Produkte gefunden. Bitte ein anderes PDF versuchen.')
      return
    }

    setProducts(extractResult.products)
    toast.success(`${extractResult.products.length} Produkte gefunden!`)
    router.push(`/editor?session=${sessionId}`)
  }, [router, setSession, setPages, setProducts])

  const isLoading = status.type !== 'idle' && status.type !== 'error'

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-3 text-5xl">💊</div>
          <h1 className="text-3xl font-bold text-blue-900">
            ApothekenAnzeigen-Editor
          </h1>
          <p className="mt-2 text-gray-600">
            Werbeflyer-PDF hochladen und Produkte einfach austauschen
          </p>
        </div>

        {/* Upload-Bereich */}
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-blue-100">
          {status.type === 'extracting' ? (
            <ExtractionProgress
              currentPage={status.current}
              totalPages={status.total}
            />
          ) : status.type === 'uploading' || status.type === 'rendering' ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner size="lg" />
              <p className="text-gray-600">
                {status.type === 'uploading' ? 'Wird hochgeladen…' : 'PDF wird verarbeitet…'}
              </p>
            </div>
          ) : (
            <DropZone onFile={handleFile} disabled={isLoading} />
          )}

          {status.type === 'error' && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {status.message}
              <button
                onClick={() => setStatus({ type: 'idle' })}
                className="ml-3 underline"
              >
                Erneut versuchen
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Unterstützt mehrseitige PDF-Dateien · Maximale Dateigröße: 10 MB
        </p>
      </div>
    </main>
  )
}
