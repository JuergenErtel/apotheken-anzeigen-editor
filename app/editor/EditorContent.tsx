'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { PdfCanvas } from '@/components/editor/PdfCanvas'
import { BoundingBoxOverlay } from '@/components/editor/BoundingBoxOverlay'
import { ProductList } from '@/components/editor/ProductList'
import { Spinner } from '@/components/ui/Spinner'
import { loadSession, saveSession } from '@/actions/session'
import { generatePdf } from '@/actions/generate'
import { toast } from '@/lib/toast'
import type { ProductEdit, BoundingBox } from '@/lib/types'

function useDebounce(fn: () => void, delay: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(fn, delay)
  }, [fn, delay])
}

export function EditorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  const {
    originalPdfUrl, pages, products, edits, activeProductId,
    setSession, setPages, setProducts, updateEdit, setActiveProduct, setGeneratedPdfUrl,
  } = useAppStore()

  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Container-Größe messen
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Session laden falls Store leer
  useEffect(() => {
    if (!sessionId) { router.push('/'); return }
    if (products.length > 0) return  // bereits geladen

    setLoading(true)
    loadSession(sessionId).then(async (result) => {
      if (!result.success) {
        toast.error('Sitzung nicht gefunden — bitte PDF erneut hochladen.')
        router.push('/')
        return
      }
      const { session } = result
      setSession(session.sessionId, session.pdfBlobUrl)
      setProducts(session.products)

      // PDF client-seitig rendern (Seiten waren nicht im Store)
      try {
        const { renderPdfPages } = await import('@/lib/pdf-client')
        const pdfResp = await fetch(session.pdfBlobUrl)
        const pdfBuffer = await pdfResp.arrayBuffer()
        const renderedPages = await renderPdfPages(pdfBuffer)
        setPages(renderedPages)
      } catch {
        toast.error('PDF-Vorschau konnte nicht geladen werden.')
      }
      setLoading(false)
    })
  }, [sessionId, products.length, router, setSession, setProducts, setPages])

  // Auto-Save
  const debouncedSave = useDebounce(
    useCallback(async () => {
      if (!sessionId || !originalPdfUrl) return
      await saveSession({
        sessionId,
        pdfBlobUrl: originalPdfUrl,
        pageCount: pages.length,
        products,
        edits,
        createdAt: new Date().toISOString(),
      })
    }, [sessionId, originalPdfUrl, pages.length, products, edits]),
    500
  )

  const handleEditChange = useCallback(
    (productId: string, edit: Partial<ProductEdit>) => {
      updateEdit(productId, edit)
      debouncedSave()
    },
    [updateEdit, debouncedSave]
  )

  const handlePositionChange = useCallback(
    (productId: string, newPosition: BoundingBox) => {
      updateEdit(productId, { position: newPosition })
      debouncedSave()
    },
    [updateEdit, debouncedSave]
  )

  const handleGenerate = async () => {
    if (!sessionId) return
    setGenerating(true)
    const result = await generatePdf(sessionId)
    setGenerating(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setGeneratedPdfUrl(result.generatedPdfUrl)
    router.push(`/download?session=${sessionId}`)
  }

  const pageProducts = products.filter((p) => p.pageNumber === currentPage)
  const totalPages = pages.length || 1

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Top Bar */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-xl">💊</span>
          <h1 className="text-lg font-semibold text-blue-900">ApothekenAnzeigen-Editor</h1>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {generating ? <><Spinner size="sm" /> Generiere…</> : '📥 PDF generieren'}
        </button>
      </header>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas (60%) */}
        <div className="flex w-3/5 flex-col border-r bg-gray-100">
          <div className="flex-1 overflow-auto p-4">
            <div className="relative" ref={containerRef}>
              <PdfCanvas pageNumber={currentPage} containerRef={containerRef} />
              {containerSize.width > 0 && (
                <BoundingBoxOverlay
                  products={pageProducts}
                  edits={edits}
                  activeProductId={activeProductId}
                  containerWidth={containerSize.width}
                  containerHeight={containerSize.height || containerSize.width * 1.414}
                  onProductClick={setActiveProduct}
                  onPositionChange={handlePositionChange}
                />
              )}
            </div>
          </div>

          {/* Seiten-Navigation */}
          <div className="flex items-center justify-between border-t bg-white px-4 py-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-30"
            >
              ◀ Vorige
            </button>
            <span className="text-sm text-gray-600">
              Seite {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-30"
            >
              Nächste ▶
            </button>
          </div>
        </div>

        {/* Produktliste (40%) */}
        <div className="flex w-2/5 flex-col">
          <div className="border-b bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-700">
              {products.length} Produkte gefunden
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ProductList
              products={products}
              edits={edits}
              activeProductId={activeProductId}
              onEditChange={handleEditChange}
              onProductSelect={(id) => {
                setActiveProduct(id)
                const product = products.find((p) => p.id === id)
                if (product) setCurrentPage(product.pageNumber)
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
