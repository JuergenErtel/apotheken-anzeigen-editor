'use server'

import { loadSession, saveGeneratedPdf, saveSession } from '@/lib/blob'
import { applyProductReplacements } from '@/lib/pdf-generate'

export async function generatePdf(
  sessionId: string
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

    const newPdfBytes = await applyProductReplacements(
      originalPdfBytes,
      session.products,
      session.edits
    )

    const generatedPdfUrl = await saveGeneratedPdf(sessionId, newPdfBytes)

    // generatedPdfUrl in Session speichern für spätere Wiederherstellung
    session.generatedPdfUrl = generatedPdfUrl
    await saveSession(session)

    return { success: true, generatedPdfUrl }
  } catch (e) {
    console.error('generatePdf error:', e)
    return { success: false, error: 'PDF-Generierung fehlgeschlagen.' }
  }
}
