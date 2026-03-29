'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAppStore } from '@/lib/store'
import { loadSession } from '@/actions/session'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/lib/toast'

const PdfComparison = dynamic(
  () => import('@/components/download/PdfComparison').then((m) => m.PdfComparison),
  { ssr: false, loading: () => <div className="flex h-64 items-center justify-center"><Spinner /></div> }
)

export function DownloadContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const { originalPdfUrl, generatedPdfUrl } = useAppStore()
  const [origUrl, setOrigUrl] = useState(originalPdfUrl)
  const [genUrl] = useState(generatedPdfUrl)
  const [loading, setLoading] = useState(!originalPdfUrl || !generatedPdfUrl)

  useEffect(() => {
    if (origUrl && genUrl) { return }
    if (!sessionId) { router.push('/'); return }

    loadSession(sessionId).then((result) => {
      if (!result.success) {
        toast.error('Sitzung nicht gefunden.')
        router.push('/')
        return
      }
      setOrigUrl(result.session.pdfBlobUrl)
      setLoading(false)
    })
  }, [sessionId, origUrl, genUrl, router])

  const handleDownload = () => {
    if (!genUrl) return
    const a = document.createElement('a')
    a.href = genUrl
    a.download = 'apotheke-anzeige-neu.pdf'
    a.click()
  }

  if (loading || !origUrl || !genUrl) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Fertig!</h1>
            <p className="text-gray-500">Vorher/Nachher-Vergleich</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/editor?session=${sessionId}`)}
              className="rounded-lg border border-blue-300 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
            >
              ← Zurück zum Editor
            </button>
            <button
              onClick={handleDownload}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              📥 Neue Anzeige herunterladen
            </button>
          </div>
        </div>

        {/* Vergleich */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <PdfComparison originalUrl={origUrl} generatedUrl={genUrl} />
        </div>
      </div>
    </main>
  )
}
