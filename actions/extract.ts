'use server'

import Anthropic from '@anthropic-ai/sdk'
import { loadSession, saveSession } from '@/lib/blob'
import { extractNativeTextItems, type NativeTextItem } from '@/lib/pdf-extract-native'
import type { Product, TextElement } from '@/lib/types'

const client = new Anthropic()

interface ClaudeProduct {
  id: string
  nameElementId?: string | null
  descriptionElementId?: string | null
  priceElementId?: string | null
  salePriceElementId?: string | null
  imageArea?: { x: number; y: number; width: number; height: number } | null
  textColor?: { r: number; g: number; b: number }
}

function buildExtractionPrompt(textItemsJson: string): string {
  return `Du analysierst eine Seite eines Apotheken-Werbeflyers.
Dir werden alle Textelemente der Seite als JSON gegeben — mit exakten Koordinaten aus der PDF-Struktur.

Textelemente:
${textItemsJson}

Gruppiere die Textelemente zu Produkten. Für jedes Produkt:
- Wähle die Element-IDs für Produktname, Beschreibung, Preis und Aktionspreis (falls vorhanden)
- Schätze die Bildfläche (x, y, width, height in % der Seite) — wo ist das Produktfoto?
- Erkenne die Textfarbe aus dem Bild

Gib NUR ein JSON-Array zurück, kein weiterer Text:
[{
  "id": "p1",
  "nameElementId": "t3",
  "descriptionElementId": "t5",
  "priceElementId": "t7",
  "salePriceElementId": null,
  "imageArea": { "x": 5, "y": 8, "width": 20, "height": 22 },
  "textColor": { "r": 0, "g": 0, "b": 0 }
}]

Wenn keine Produkte erkennbar sind, antworte mit [].`
}

function toTextElement(item: NativeTextItem): TextElement {
  return {
    text: item.text,
    position: { x: item.x, y: item.y, width: item.width, height: item.height },
    fontSize: item.fontSize,
    fontBold: item.fontBold,
    fontItalic: item.fontItalic,
    textColor: item.color,
  }
}

function buildProduct(
  claude: ClaudeProduct,
  itemMap: Map<string, NativeTextItem>,
  pageNumber: number,
  productIndex: number
): Product {
  const nameItem = claude.nameElementId ? itemMap.get(claude.nameElementId) : undefined
  const descItem = claude.descriptionElementId ? itemMap.get(claude.descriptionElementId) : undefined
  const priceItem = claude.priceElementId ? itemMap.get(claude.priceElementId) : undefined
  const salePriceItem = claude.salePriceElementId ? itemMap.get(claude.salePriceElementId) : undefined

  // Gesamtposition: Umschließendes Rechteck aller Elemente + Bildfläche
  const allBoxes = [
    claude.imageArea,
    nameItem && { x: nameItem.x, y: nameItem.y, width: nameItem.width, height: nameItem.height },
    descItem && { x: descItem.x, y: descItem.y, width: descItem.width, height: descItem.height },
    priceItem && { x: priceItem.x, y: priceItem.y, width: priceItem.width, height: priceItem.height },
    salePriceItem && { x: salePriceItem.x, y: salePriceItem.y, width: salePriceItem.width, height: salePriceItem.height },
  ].filter(Boolean) as { x: number; y: number; width: number; height: number }[]

  let position = { x: 0, y: 0, width: 50, height: 30 }
  if (allBoxes.length > 0) {
    const minX = Math.min(...allBoxes.map(b => b.x))
    const minY = Math.min(...allBoxes.map(b => b.y))
    const maxX = Math.max(...allBoxes.map(b => b.x + b.width))
    const maxY = Math.max(...allBoxes.map(b => b.y + b.height))
    position = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  return {
    id: `page${pageNumber}-prod${productIndex + 1}`,
    name: nameItem?.text ?? '',
    description: descItem?.text ?? '',
    price: priceItem?.text ?? '',
    salePrice: salePriceItem?.text,
    position,
    pageNumber,
    nameElement: nameItem ? toTextElement(nameItem) : undefined,
    descriptionElement: descItem ? toTextElement(descItem) : undefined,
    priceElement: priceItem ? toTextElement(priceItem) : undefined,
    salePriceElement: salePriceItem ? toTextElement(salePriceItem) : undefined,
    imagePosition: claude.imageArea ?? undefined,
    textColor: claude.textColor ?? { r: 0, g: 0, b: 0 },
  }
}

export async function extractProducts(
  sessionId: string,
  pageImages: Array<{ pageNumber: number; dataUrl: string }>,
  pdfBlobUrl: string
): Promise<{ success: true; products: Product[] } | { success: false; error: string }> {
  try {
    // PDF-Bytes laden für native Extraktion
    const pdfResp = await fetch(pdfBlobUrl)
    if (!pdfResp.ok) throw new Error(`PDF konnte nicht geladen werden (${pdfResp.status})`)
    const pdfBytes = await pdfResp.arrayBuffer()

    const allProducts: Product[] = []

    for (const { pageNumber, dataUrl } of pageImages) {
      // Phase 1: pdfjs — exakte Textpositionen
      const nativeItems = await extractNativeTextItems(pdfBytes, pageNumber)
      const itemMap = new Map(nativeItems.map(i => [i.id, i]))
      const textItemsJson = JSON.stringify(
        nativeItems.map(({ id, text, x, y, width, height, fontSize, fontBold }) =>
          ({ id, text, x: +x.toFixed(2), y: +y.toFixed(2), width: +width.toFixed(2), height: +height.toFixed(2), fontSize: +fontSize.toFixed(1), fontBold })
        ),
        null, 2
      )

      // Phase 2: Claude — semantische Klassifikation
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
            { type: 'text', text: `Seite ${pageNumber}:\n${buildExtractionPrompt(textItemsJson)}` },
          ],
        }],
      })

      const text = message.content[0].type === 'text' ? message.content[0].text : '[]'

      try {
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
        const claudeProducts = JSON.parse(cleaned) as ClaudeProduct[]
        const products = claudeProducts.map((cp, i) => buildProduct(cp, itemMap, pageNumber, i))
        allProducts.push(...products)
      } catch (parseErr) {
        console.warn(`extractProducts: Seite ${pageNumber} — JSON parse fehlgeschlagen:`, parseErr, '\nClaude output:', text)
      }
    }

    // Session aktualisieren
    const session = await loadSession(sessionId)
    if (session) {
      session.products = allProducts
      session.pageCount = pageImages.length
      session.edits = Object.fromEntries(allProducts.map(p => [p.id, { active: true }]))
      await saveSession(session)
    }

    return { success: true, products: allProducts }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('extractProducts error:', msg)
    return { success: false, error: `Extraktion fehlgeschlagen: ${msg}` }
  }
}
