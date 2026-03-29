'use server'

import Anthropic from '@anthropic-ai/sdk'
import { loadSession, saveSession } from '@/lib/blob'
import type { Product } from '@/lib/types'

const client = new Anthropic()

const EXTRACTION_PROMPT = `Du analysierst eine Seite eines Apotheken-Werbeflyers.
Extrahiere ALLE Produktangebote auf dieser Seite.
Gib für jedes Produkt zurück:
{
  "id": "eindeutiger String (z.B. p1, p2, ...)",
  "name": "Produktname",
  "description": "Untertitel oder Kurzbeschreibung",
  "price": "regulärer Preis als String",
  "salePrice": "Aktions-/Sonderpreis falls vorhanden, sonst null",
  "position": {
    "x": Prozent von links (0-100),
    "y": Prozent von oben (0-100),
    "width": Prozent der Seitenbreite (0-100),
    "height": Prozent der Seitenhöhe (0-100)
  },
  "pageNumber": Seitennummer als Zahl
}
Antworte NUR mit einem JSON-Array, kein weiterer Text. Wenn keine Produkte sichtbar sind, antworte mit [].`

export async function extractProducts(
  sessionId: string,
  pageImages: Array<{ pageNumber: number; dataUrl: string }>
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> {
  try {
    const allProducts: Product[] = []

    for (const { pageNumber, dataUrl } of pageImages) {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')

      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: base64 },
              },
              { type: 'text', text: `Seite ${pageNumber}:\n${EXTRACTION_PROMPT}` },
            ],
          },
        ],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : '[]'

      try {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        const parsed = JSON.parse(cleaned) as Product[]
        const withPage = parsed.map((p, i) => ({
          ...p,
          id: `page${pageNumber}-prod${i + 1}`,
          pageNumber,
          salePrice: p.salePrice ?? undefined,
        }))
        allProducts.push(...withPage)
      } catch {
        // Seite ohne Produkte — ignorieren
      }
    }

    // Session aktualisieren
    const session = await loadSession(sessionId)
    if (session) {
      session.products = allProducts
      session.pageCount = pageImages.length
      session.edits = Object.fromEntries(
        allProducts.map((p) => [p.id, { active: true }])
      )
      await saveSession(session)
    }

    return { success: true, products: allProducts }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('extractProducts error:', msg)
    return { success: false, error: `Extraktion fehlgeschlagen: ${msg}` }
  }
}
