'use server'

import { randomUUID } from 'crypto'
import { uploadPdfToBlob, saveSession } from '@/lib/blob'
import type { SessionData } from '@/lib/types'

export interface UploadResult {
  sessionId: string
  pdfBlobUrl: string
  pageCount: number
}

export async function uploadPdf(
  formData: FormData
): Promise<{ success: true; data: UploadResult } | { success: false; error: string }> {
  try {
    const file = formData.get('pdf') as File | null
    if (!file || file.type !== 'application/pdf') {
      return { success: false, error: 'Bitte eine gültige PDF-Datei hochladen.' }
    }

    const sessionId = randomUUID()
    const pdfBuffer = await file.arrayBuffer()
    const pdfBlobUrl = await uploadPdfToBlob(sessionId, pdfBuffer)

    const session: SessionData = {
      sessionId,
      pdfBlobUrl,
      pageCount: 0,
      products: [],
      edits: {},
      createdAt: new Date().toISOString(),
    }
    await saveSession(session)

    return { success: true, data: { sessionId, pdfBlobUrl, pageCount: 0 } }
  } catch (e) {
    console.error('uploadPdf error:', e)
    return { success: false, error: 'Upload fehlgeschlagen. Bitte erneut versuchen.' }
  }
}
