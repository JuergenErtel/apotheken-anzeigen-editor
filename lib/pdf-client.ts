'use client'

import type { PageImage } from '@/lib/types'

let pdfjsLib: typeof import('pdfjs-dist') | null = null

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
  }
  return pdfjsLib
}

/**
 * Rendert alle Seiten eines PDFs als base64-PNG-Data-URLs.
 * Gibt pro Seite Fortschritts-Callback mit (aktuelle Seite, Gesamtseiten).
 */
export async function renderPdfPages(
  pdfData: ArrayBuffer,
  onProgress?: (current: number, total: number) => void
): Promise<PageImage[]> {
  const pdfjs = await getPdfjs()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfData) })
  const pdf = await loadingTask.promise
  const total = pdf.numPages
  const images: PageImage[] = []

  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 1.5 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    images.push({ pageNumber: i, dataUrl: canvas.toDataURL('image/png') })
  }

  return images
}

/** Gibt die Anzahl der Seiten in einem PDF zurück (ohne Rendering). */
export async function getPdfPageCount(pdfData: ArrayBuffer): Promise<number> {
  const pdfjs = await getPdfjs()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfData) }).promise
  return pdf.numPages
}
