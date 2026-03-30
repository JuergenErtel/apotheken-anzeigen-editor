# PDF-Native Extraction & Rendering Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Claude-estimated bounding boxes with pdfjs-extracted exact coordinates, and fix image/text rendering bugs so replaced content looks like the original.

**Architecture:** pdfjs extracts exact text positions (x, y, fontSize, bold) server-side; Claude classifies element IDs into products without guessing coordinates; pdf-lib renders each text field in its own exact box using real font metrics, images fill the full bounding box.

**Tech Stack:** pdfjs-dist (v5.5, already installed), pdf-lib, sharp, Anthropic SDK, Next.js Server Actions

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/types.ts` | Modify | Add `TextElement`, extend `Product` |
| `lib/pdf-extract-native.ts` | Create | pdfjs server-side text extraction |
| `lib/pdf-generate.ts` | Modify | Fix image size, real font metrics, per-field boxes |
| `actions/extract.ts` | Modify | Two-phase extraction, new Claude prompt |
| `__tests__/lib/pdf-extract-native.test.ts` | Create | Tests for text extraction |
| `__tests__/lib/pdf-generate.test.ts` | Modify | Update + add tests for new rendering |

---

## Task 1: Extend types.ts

**Files:**
- Modify: `lib/types.ts`

No runtime behavior to test — type correctness is verified by TypeScript compilation in Task 2+.

- [ ] **Step 1: Add `TextElement` and update `Product`**

Replace the contents of `lib/types.ts` with:

```typescript
export interface BoundingBox {
  x: number      // % von links (0–100)
  y: number      // % von oben (0–100)
  width: number  // % der Seitenbreite (0–100)
  height: number // % der Seitenhöhe (0–100)
}

/** Ein einzelnes Textelement aus der PDF-Struktur mit exakten Koordinaten */
export interface TextElement {
  text: string
  position: BoundingBox
  fontSize: number
  fontBold: boolean
  fontItalic: boolean
  textColor: { r: number; g: number; b: number }
}

export interface Product {
  id: string
  name: string
  description: string
  price: string
  salePrice?: string
  position: BoundingBox      // Gesamte Produktfläche / Fallback
  pageNumber: number

  // Exakte Textpositionen aus pdfjs-Extraktion
  nameElement?: TextElement
  descriptionElement?: TextElement
  priceElement?: TextElement
  salePriceElement?: TextElement
  imagePosition?: BoundingBox  // Claude-Schätzung, durch Textanker präziser

  // Fallback-Felder (bleiben für Rückwärtskompatibilität)
  textColor?: { r: number; g: number; b: number }
  fontSize?: number
  fontBold?: boolean
}

export interface ProductEdit {
  name?: string
  description?: string
  price?: string
  salePrice?: string
  position?: BoundingBox
  replacementImage?: string  // base64 JPEG Data-URL
  active: boolean
}

export interface SessionData {
  sessionId: string
  pdfBlobUrl: string
  pageCount: number
  products: Product[]
  edits: Record<string, ProductEdit>
  createdAt: string
  generatedPdfUrl?: string
}

export interface PageImage {
  pageNumber: number
  dataUrl: string  // base64 PNG
}

export type ExtractionStatus =
  | { type: 'idle' }
  | { type: 'uploading' }
  | { type: 'extracting'; currentPage: number; totalPages: number }
  | { type: 'done' }
  | { type: 'error'; message: string }
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add TextElement interface and extend Product with per-field positions"
```

---

## Task 2: Create `lib/pdf-extract-native.ts`

**Files:**
- Create: `lib/pdf-extract-native.ts`
- Create: `__tests__/lib/pdf-extract-native.test.ts`

pdfjs runs without a worker in Node.js (Server Actions, Jest). Set `GlobalWorkerOptions.workerSrc = ''`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/lib/pdf-extract-native.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { extractNativeTextItems } from '@/lib/pdf-extract-native'
import { PDFDocument, StandardFonts } from 'pdf-lib'

async function makePdf(text: string, x: number, y: number, size: number): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText(text, { x, y, size, font })
  const bytes = await doc.save()
  return bytes.buffer as ArrayBuffer
}

describe('extractNativeTextItems', () => {
  it('extrahiert Textelemente mit Text und Position', async () => {
    const pdfBytes = await makePdf('Ibuprofen 400mg', 50, 700, 14)
    const items = await extractNativeTextItems(pdfBytes, 1)

    expect(items.length).toBeGreaterThan(0)
    const found = items.find(i => i.text.includes('Ibuprofen'))
    expect(found).toBeDefined()
  })

  it('gibt Positionen als Prozentwerte zurück (0-100)', async () => {
    const pdfBytes = await makePdf('Test', 50, 700, 12)
    const items = await extractNativeTextItems(pdfBytes, 1)

    for (const item of items) {
      expect(item.x).toBeGreaterThanOrEqual(0)
      expect(item.x).toBeLessThanOrEqual(100)
      expect(item.y).toBeGreaterThanOrEqual(0)
      expect(item.y).toBeLessThanOrEqual(100)
    }
  })

  it('gibt Schriftgröße in Punkt zurück', async () => {
    const pdfBytes = await makePdf('Preis', 50, 600, 18)
    const items = await extractNativeTextItems(pdfBytes, 1)

    const found = items.find(i => i.text.includes('Preis'))
    expect(found).toBeDefined()
    expect(found!.fontSize).toBeCloseTo(18, 0)
  })

  it('gibt leeres Array für Seite ohne Text zurück', async () => {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const bytes = await doc.save()
    const items = await extractNativeTextItems(bytes.buffer as ArrayBuffer, 1)
    expect(items).toEqual([])
  })

  it('erkennt Bold aus dem Fontnamen', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage([595, 842])
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold)
    page.drawText('Fetter Text', { x: 50, y: 700, size: 12, font: boldFont })
    const bytes = await doc.save()
    const items = await extractNativeTextItems(bytes.buffer as ArrayBuffer, 1)

    const found = items.find(i => i.text.includes('Fetter'))
    expect(found).toBeDefined()
    expect(found!.fontBold).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/lib/pdf-extract-native.test.ts --no-coverage
```

Expected: `Cannot find module '@/lib/pdf-extract-native'`

- [ ] **Step 3: Implement `lib/pdf-extract-native.ts`**

Create `lib/pdf-extract-native.ts`:

```typescript
export interface NativeTextItem {
  id: string
  text: string
  x: number       // % von links (0-100)
  y: number       // % von oben (0-100)
  width: number   // % der Seitenbreite
  height: number  // % der Seitenhöhe
  fontSize: number
  fontBold: boolean
  fontItalic: boolean
  color: { r: number; g: number; b: number }
}

export async function extractNativeTextItems(
  pdfBytes: ArrayBuffer,
  pageNumber: number
): Promise<NativeTextItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = ''

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(pageNumber)
  const { width: pageWidth, height: pageHeight } = page.getViewport({ scale: 1 })

  const content = await page.getTextContent()
  const items: NativeTextItem[] = []

  content.items.forEach((raw, index) => {
    // pdfjs TextItem hat: str, transform, width, height, fontName
    if (!('str' in raw) || !raw.str.trim()) return

    const item = raw as {
      str: string
      transform: number[]
      width: number
      height: number
      fontName: string
    }

    // transform = [scaleX, skewX, skewY, scaleY, translateX, translateY]
    const [a, b, , , tx, ty] = item.transform
    const fontSize = Math.sqrt(a * a + b * b)

    // PDF-Koordinaten: Ursprung unten-links → % Ursprung oben-links
    const xPct = (tx / pageWidth) * 100
    const yPct = ((pageHeight - ty) / pageHeight) * 100
    const wPct = (item.width / pageWidth) * 100
    const hPct = (fontSize / pageHeight) * 100

    const fontName = item.fontName ?? ''
    const fontBold = /bold|heavy|black/i.test(fontName)
    const fontItalic = /italic|oblique/i.test(fontName)

    items.push({
      id: `t${index + 1}`,
      text: item.str,
      x: Math.max(0, Math.min(100, xPct)),
      y: Math.max(0, Math.min(100, yPct)),
      width: Math.max(0, Math.min(100, wPct)),
      height: Math.max(0, Math.min(100, hPct)),
      fontSize,
      fontBold,
      fontItalic,
      color: { r: 0, g: 0, b: 0 },
    })
  })

  return items
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/lib/pdf-extract-native.test.ts --no-coverage
```

Expected: all 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pdf-extract-native.ts __tests__/lib/pdf-extract-native.test.ts
git commit -m "feat: add pdf-extract-native — exact text positions via pdfjs"
```

---

## Task 3: Fix `lib/pdf-generate.ts`

**Files:**
- Modify: `lib/pdf-generate.ts`
- Modify: `__tests__/lib/pdf-generate.test.ts`

Three bugs to fix: image `* 0.6`, approximate text metrics, all text in one box.

- [ ] **Step 1: Update tests — add new cases, remove `fitTextInBox` test**

Replace `__tests__/lib/pdf-generate.test.ts`:

```typescript
/**
 * @jest-environment node
 */
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { convertBoundingBox, applyProductReplacements } from '@/lib/pdf-generate'
import type { BoundingBox, Product, ProductEdit, TextElement } from '@/lib/types'

describe('convertBoundingBox', () => {
  const pageWidth = 595
  const pageHeight = 842

  it('konvertiert % korrekt in PDF-Koordinaten', () => {
    const box: BoundingBox = { x: 10, y: 20, width: 30, height: 15 }
    const result = convertBoundingBox(box, pageWidth, pageHeight)
    expect(result.x).toBeCloseTo(59.5)
    expect(result.y).toBeCloseTo(547.3)
    expect(result.width).toBeCloseTo(178.5)
    expect(result.height).toBeCloseTo(126.3)
  })

  it('Box oben-links → pdf-lib Koordinaten', () => {
    const box: BoundingBox = { x: 0, y: 0, width: 100, height: 100 }
    const result = convertBoundingBox(box, pageWidth, pageHeight)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBe(pageWidth)
    expect(result.height).toBe(pageHeight)
  })
})

describe('applyProductReplacements — TextElement rendering', () => {
  async function makeMinimalPdf(): Promise<ArrayBuffer> {
    const doc = await PDFDocument.create()
    doc.addPage([595, 842])
    const bytes = await doc.save()
    return bytes.buffer as ArrayBuffer
  }

  function makeTextElement(overrides: Partial<TextElement> = {}): TextElement {
    return {
      text: 'Ibuprofen 400mg',
      position: { x: 5, y: 10, width: 40, height: 5 },
      fontSize: 12,
      fontBold: false,
      fontItalic: false,
      textColor: { r: 0, g: 0, b: 0 },
      ...overrides,
    }
  }

  it('erzeugt ein gültiges PDF wenn TextElements vorhanden sind', async () => {
    const pdfBytes = await makeMinimalPdf()
    const product: Product = {
      id: 'p1',
      name: 'Ibuprofen 400mg',
      description: 'Schmerzmittel',
      price: '€4,99',
      position: { x: 5, y: 10, width: 40, height: 30 },
      pageNumber: 1,
      nameElement: makeTextElement({ fontBold: true }),
      descriptionElement: makeTextElement({ position: { x: 5, y: 16, width: 40, height: 4 }, fontSize: 10 }),
      priceElement: makeTextElement({ position: { x: 5, y: 22, width: 20, height: 5 }, fontSize: 14 }),
    }
    const edit: ProductEdit = { active: true }

    const result = await applyProductReplacements(pdfBytes, [product], { p1: edit })
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.length).toBeGreaterThan(0)

    // Neues PDF muss ladbar sein
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('erzeugt gültiges PDF ohne TextElements (Fallback)', async () => {
    const pdfBytes = await makeMinimalPdf()
    const product: Product = {
      id: 'p1',
      name: 'Aspirin',
      description: 'Tabletten',
      price: '€3,99',
      position: { x: 5, y: 10, width: 40, height: 30 },
      pageNumber: 1,
      fontSize: 12,
      fontBold: false,
    }
    const edit: ProductEdit = { active: true }

    const result = await applyProductReplacements(pdfBytes, [product], { p1: edit })
    expect(result).toBeInstanceOf(Uint8Array)
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })

  it('überspringt inaktive Produkte', async () => {
    const pdfBytes = await makeMinimalPdf()
    const product: Product = {
      id: 'p1', name: 'Test', description: '', price: '€1,00',
      position: { x: 5, y: 5, width: 20, height: 10 }, pageNumber: 1,
    }
    // Kein Fehler, leere Ausgabe-PDF ist trotzdem gültig
    const result = await applyProductReplacements(pdfBytes, [product], { p1: { active: false } })
    const reloaded = await PDFDocument.load(result)
    expect(reloaded.getPageCount()).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to see current state**

```bash
npx jest __tests__/lib/pdf-generate.test.ts --no-coverage
```

Expected: `convertBoundingBox` tests pass, new `applyProductReplacements` tests may fail.

- [ ] **Step 3: Rewrite `lib/pdf-generate.ts`**

Replace the full file:

```typescript
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import type { BoundingBox, TextElement, Product, ProductEdit } from '@/lib/types'

export interface PdfRect {
  x: number
  y: number
  width: number
  height: number
}

/** Konvertiert %-Koordinaten (Ursprung oben-links) in pdf-lib-Koordinaten (Ursprung unten-links) */
export function convertBoundingBox(
  box: BoundingBox,
  pageWidth: number,
  pageHeight: number
): PdfRect {
  const x = (box.x / 100) * pageWidth
  const y = pageHeight - ((box.y + box.height) / 100) * pageHeight
  const width = (box.width / 100) * pageWidth
  const height = (box.height / 100) * pageHeight
  return { x, y, width, height }
}

/** Findet die größte Schriftgröße mit der `text` in `maxWidth` passt. */
function fitFontSize(text: string, font: PDFFont, maxWidth: number, maxFontSize: number): number {
  for (let size = Math.ceil(maxFontSize); size >= 4; size--) {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return size
  }
  return 4
}

/** Zeichnet einen Text in eine exakte TextElement-Box mit Original-Stil. */
function drawTextElement(
  page: PDFPage,
  text: string,
  element: TextElement,
  fonts: { regular: PDFFont; bold: PDFFont },
  pageWidth: number,
  pageHeight: number
) {
  if (!text.trim()) return
  const font = element.fontBold ? fonts.bold : fonts.regular
  const rect = convertBoundingBox(element.position, pageWidth, pageHeight)
  const fontSize = fitFontSize(text, font, rect.width, element.fontSize)
  const color = rgb(
    element.textColor.r / 255,
    element.textColor.g / 255,
    element.textColor.b / 255
  )
  // Vertikal zentriert in der Box
  const y = rect.y + (rect.height - fontSize) / 2
  page.drawText(text, { x: rect.x, y, size: fontSize, font, color })
}

/** Fallback: alle Felder in eine gemeinsame Box, wenn keine TextElements vorhanden. */
function drawTextBlockFallback(
  page: PDFPage,
  lines: string[],
  rect: PdfRect,
  font: PDFFont,
  maxFontSize: number,
  textColor: { r: number; g: number; b: number }
) {
  const padding = 4
  const availWidth = rect.width - padding * 2
  const color = rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255)

  lines.forEach((line, i) => {
    if (!line) return
    const fontSize = fitFontSize(line, font, availWidth, maxFontSize)
    const lineY = rect.y + rect.height - padding - (i + 1) * fontSize * 1.3
    if (lineY >= rect.y) {
      page.drawText(line, { x: rect.x + padding, y: lineY, size: fontSize, font, color })
    }
  })
}

export async function applyProductReplacements(
  originalPdfBytes: ArrayBuffer,
  products: Product[],
  edits: Record<string, ProductEdit>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular: helvetica, bold: helveticaBold }
  const pages = pdfDoc.getPages()

  for (const product of products) {
    const edit = edits[product.id]
    if (!edit?.active) continue

    const pageIndex = product.pageNumber - 1
    if (pageIndex < 0 || pageIndex >= pages.length) continue
    const page = pages[pageIndex]
    const { width: pageWidth, height: pageHeight } = page.getSize()

    const position = edit.position ?? product.position
    const rect = convertBoundingBox(position, pageWidth, pageHeight)

    // 1. Weißes Rechteck über Original
    const coverMargin = 4
    page.drawRectangle({
      x: rect.x - coverMargin,
      y: rect.y - coverMargin,
      width: rect.width + coverMargin * 2,
      height: rect.height + coverMargin * 2,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    })

    // 2. Ersatzbild einbetten — füllt die volle imagePosition-Box
    if (edit.replacementImage) {
      const imgPos = product.imagePosition ?? product.position
      const imgRect = convertBoundingBox(imgPos, pageWidth, pageHeight)
      try {
        const sharp = (await import('sharp')).default
        const base64Data = edit.replacementImage.replace(/^data:image\/\w+;base64,/, '')
        const rawBytes = Buffer.from(base64Data, 'base64')
        const jpegBytes = await sharp(rawBytes)
          .resize(Math.round(imgRect.width * 2), Math.round(imgRect.height * 2), { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .jpeg({ quality: 85 })
          .toBuffer()
        const image = await pdfDoc.embedJpg(jpegBytes)
        page.drawImage(image, {
          x: imgRect.x,
          y: imgRect.y,
          width: imgRect.width,
          height: imgRect.height,
        })
      } catch {
        // Bild-Einbettung ignorieren wenn fehlerhaft
      }
    }

    // 3. Text: exakte TextElement-Boxen wenn vorhanden, sonst Fallback
    const name = edit.name ?? product.name
    const description = edit.description ?? product.description
    const price = edit.salePrice ?? edit.price ?? product.salePrice ?? product.price

    const hasTextElements = !!(product.nameElement || product.descriptionElement || product.priceElement)

    if (hasTextElements) {
      if (product.nameElement && name) {
        drawTextElement(page, name, product.nameElement, fonts, pageWidth, pageHeight)
      }
      if (product.descriptionElement && description) {
        drawTextElement(page, description, product.descriptionElement, fonts, pageWidth, pageHeight)
      }
      if (product.priceElement && price) {
        drawTextElement(page, price, product.priceElement, fonts, pageWidth, pageHeight)
      }
      if (product.salePriceElement && product.salePrice) {
        const sp = edit.salePrice ?? product.salePrice
        drawTextElement(page, sp, product.salePriceElement, fonts, pageWidth, pageHeight)
      }
    } else {
      // Fallback für ältere Sessions ohne TextElements
      const font = product.fontBold === false ? helvetica : helveticaBold
      const maxFontSize = product.fontSize ?? 14
      const textColor = product.textColor ?? { r: 0, g: 0, b: 0 }
      drawTextBlockFallback(
        page,
        [name, description, price].filter(Boolean),
        rect,
        font,
        maxFontSize,
        textColor
      )
    }
  }

  return pdfDoc.save()
}
```

- [ ] **Step 4: Run tests**

```bash
npx jest __tests__/lib/pdf-generate.test.ts --no-coverage
```

Expected: alle Tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/pdf-generate.ts __tests__/lib/pdf-generate.test.ts
git commit -m "fix: use exact TextElement positions and real font metrics in pdf-generate"
```

---

## Task 4: Update `actions/extract.ts` — two-phase extraction

**Files:**
- Modify: `actions/extract.ts`

Claude bekommt strukturierte Textdaten und muss keine Koordinaten mehr schätzen — nur noch semantisch gruppieren.

- [ ] **Step 1: Implementiere die neue zweiphasige Extraktion**

Replace `actions/extract.ts`:

```typescript
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
    salePrice: salePriceItem?.text ?? undefined,
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
      } catch {
        // Seite ohne erkennbare Produkte — ignorieren
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
```

- [ ] **Step 2: Update the call site in `app/UploadContent.tsx`**

The function signature changed: it now takes `pdfBlobUrl` as a third argument. `pdfBlobUrl` is already available in scope at line 40 (`setSession(sessionId, pdfBlobUrl)`).

In `app/UploadContent.tsx`, change line 52:

```typescript
// Vorher:
const extractResult = await extractProducts(sessionId, pages)

// Nachher:
const extractResult = await extractProducts(sessionId, pages, pdfBlobUrl)
```

- [ ] **Step 3: Run all tests**

```bash
npx jest --no-coverage
```

Expected: alle Tests PASS

- [ ] **Step 4: Commit**

```bash
git add actions/extract.ts
git commit -m "feat: two-phase extraction — pdfjs for exact positions, Claude for semantic grouping"
```

---

## Task 5: Integration smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Upload a test PDF**

Gehe zu `http://localhost:3000`, lade einen Apotheken-Flyer hoch und prüfe:
- Werden Produkte erkannt?
- Liegen die Bounding Boxes auf dem Editor-Canvas an der richtigen Stelle?

- [ ] **Step 3: Ersetze ein Bild und einen Text**

Klicke ein Produkt an, lade ein Ersatzbild hoch, ändere den Namen, und generiere das PDF.

Erwartetes Ergebnis:
- Bild füllt die komplette Bild-Box (kein Abschneiden oben)
- Text sitzt in der exakten Original-Position
- Schriftgröße passt zur Original-Größe

- [ ] **Step 4: Commit falls alles passt**

```bash
git add -p
git commit -m "fix: complete PDF-native extraction and rendering fixes"
```
