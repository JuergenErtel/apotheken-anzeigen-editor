'use server'

import { loadSession, saveGeneratedPdf, saveSession } from '@/lib/blob'
import { applyProductReplacements } from '@/lib/pdf-generate'
import type { Product, ProductEdit } from '@/lib/types'

export async function generatePdf(
  sessionId: string,
  currentProducts: Product[],
  currentEdits: Record<string, ProductEdit>
): Promise<{ success: true; generatedPdfUrl: string } | { success: false; error: string }> {
  try {
    const session = await loadSession(sessionId)
    if (!session) {
      return { success: false, error: 'Sitzung nicht gefunden.' }
    }

    const pdfResponse = await fetch(session.pdfBlobUrl)
    if (!pdfResponse.ok) {
      return { success: false, error: 'Original-PDF konnte nicht geladen werden.' }
    }
    const originalPdfBytes = await pdfResponse.arrayBuffer()

    // Aktuelle Produkte/Edits direkt verwenden (nicht aus dem Session-Blob lesen)
    // um Race-Condition mit Auto-Save zu vermeiden
    const newPdfBytes = await applyProductReplacements(
      originalPdfBytes,
      currentProducts,
      currentEdits
    )

    const generatedPdfUrl = await saveGeneratedPdf(sessionId, newPdfBytes)

    // Aktuelle Produkte/Edits + generatedPdfUrl in Session speichern
    session.products = currentProducts
    session.edits = currentEdits
    session.generatedPdfUrl = generatedPdfUrl
    await saveSession(session)

    return { success: true, generatedPdfUrl }
  } catch (e) {
    console.error('generatePdf error:', e)
    return { success: false, error: 'PDF-Generierung fehlgeschlagen.' }
  }
}
