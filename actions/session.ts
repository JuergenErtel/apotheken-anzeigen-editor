'use server'

import { loadSession as loadFromBlob, saveSession as saveToBlob } from '@/lib/blob'
import type { SessionData } from '@/lib/types'

export async function loadSession(
  sessionId: string
): Promise<{ success: true; session: SessionData } | { success: false; error: string }> {
  const session = await loadFromBlob(sessionId)
  if (!session) {
    return { success: false, error: 'Sitzung nicht gefunden.' }
  }
  return { success: true, session }
}

export async function saveSession(
  session: SessionData
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await saveToBlob(session)
    return { success: true }
  } catch {
    return { success: false, error: 'Speichern fehlgeschlagen.' }
  }
}
