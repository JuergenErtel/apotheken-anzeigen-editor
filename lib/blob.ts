import { put, head } from '@vercel/blob'
import type { SessionData } from '@/lib/types'

function sessionKey(sessionId: string) {
  return `sessions/${sessionId}/session.json`
}

function pdfKey(sessionId: string) {
  return `sessions/${sessionId}/source.pdf`
}

export async function uploadPdfToBlob(
  sessionId: string,
  pdfBuffer: ArrayBuffer
): Promise<string> {
  const blob = await put(pdfKey(sessionId), pdfBuffer, {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: false,
  })
  return blob.url
}

export async function saveSession(sessionData: SessionData): Promise<void> {
  await put(sessionKey(sessionData.sessionId), JSON.stringify(sessionData), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  })
}

export async function loadSession(
  sessionId: string
): Promise<SessionData | null> {
  try {
    const key = sessionKey(sessionId)
    const metadata = await head(key)
    const response = await fetch(metadata.url)
    if (!response.ok) return null
    return (await response.json()) as SessionData
  } catch {
    return null
  }
}

export async function saveGeneratedPdf(
  sessionId: string,
  pdfBytes: Uint8Array
): Promise<string> {
  const blob = await put(
    `sessions/${sessionId}/generated.pdf`,
    Buffer.from(pdfBytes),
    { access: 'public', contentType: 'application/pdf', addRandomSuffix: false }
  )
  return blob.url
}
