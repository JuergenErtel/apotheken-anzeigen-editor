# ApothekenAnzeigen-Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Next.js 15 App-Router-App die Apotheken-Werbeflyer-PDFs hochlädt, via Claude Vision Produkte extrahiert, bearbeiten lässt und ein neues PDF mit ersetzten Produkten generiert.

**Architecture:** Drei Seiten (Upload / Editor / Download). Vercel Blob speichert PDF + Session-JSON. Client rendert PDF-Seiten via pdfjs-dist (base64), sendet Bilder an Server Actions. Zustand verwaltet Client-State. pdf-lib erzeugt neues PDF serverseitig.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Zustand, pdfjs-dist, pdf-lib, @anthropic-ai/sdk, @vercel/blob, sharp, react-dropzone, Jest, @testing-library/react

---

## Datei-Übersicht

| Datei | Verantwortung |
|-------|--------------|
| `app/layout.tsx` | Root-Layout, Toaster Provider |
| `app/page.tsx` | Upload-Seite |
| `app/editor/page.tsx` | Editor-Seite (lädt Session per URL-Param) |
| `app/download/page.tsx` | Download-Seite |
| `app/globals.css` | Tailwind-Direktiven |
| `lib/types.ts` | Alle TypeScript-Interfaces |
| `lib/store.ts` | Zustand Store |
| `lib/pdf-client.ts` | pdfjs-dist Rendering-Utilities (nur Browser) |
| `lib/pdf-generate.ts` | pdf-lib Generierungs-Utilities + Koordinaten-Konvertierung (Server) |
| `lib/blob.ts` | Vercel Blob Session-Utilities |
| `actions/upload.ts` | `uploadPdf` Server Action |
| `actions/extract.ts` | `extractProducts` Server Action |
| `actions/session.ts` | `saveSession` / `loadSession` Server Actions |
| `actions/generate.ts` | `generatePdf` Server Action |
| `components/upload/DropZone.tsx` | Drag-and-Drop PDF-Upload |
| `components/upload/ExtractionProgress.tsx` | Fortschrittsanzeige pro Seite |
| `components/editor/PdfCanvas.tsx` | PDF-Seiten-Canvas-Renderer |
| `components/editor/BoundingBoxOverlay.tsx` | Drag/Resize Produkt-Boxen |
| `components/editor/ProductList.tsx` | Scrollbare Produktkarten-Liste |
| `components/editor/ProductCard.tsx` | Einzelne bearbeitbare Produktkarte |
| `components/download/PdfComparison.tsx` | Vorher/Nachher-Vergleich |
| `components/ui/Toast.tsx` | Toast-Benachrichtigungen |
| `components/ui/Spinner.tsx` | Lade-Spinner |
| `__tests__/lib/pdf-generate.test.ts` | Unit-Tests Koordinaten-Konvertierung |
| `__tests__/lib/store.test.ts` | Unit-Tests Zustand Store |
| `__tests__/components/ProductCard.test.tsx` | Component-Tests ProductCard |
| `__tests__/components/DropZone.test.tsx` | Component-Tests DropZone |

---

### Task 1: Projekt-Setup & Abhängigkeiten

**Files:**
- Create: `package.json` (via create-next-app)
- Create: `.env.local`
- Create: `next.config.ts`
- Create: `jest.config.ts`
- Create: `jest.setup.ts`
- Create: `.gitignore` (Update)

- [ ] **Step 1: Next.js 15 App erstellen**

```bash
cd "C:\Users\juerg\apotheken-anzeigen-editor"
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --use-npm --no-git
```

Bei Abfragen: ESLint → Yes, App Router → Yes, `src/` → No. Falls git-Init abgefragt wird → No (bereits initialisiert).

Expected: Next.js 15 Projektstruktur vorhanden.

- [ ] **Step 2: Produktions-Abhängigkeiten installieren**

```bash
npm install pdfjs-dist pdf-lib @anthropic-ai/sdk @vercel/blob sharp react-dropzone zustand
```

Expected: Alle Pakete ohne Fehler installiert.

- [ ] **Step 3: Dev-Abhängigkeiten installieren**

```bash
npm install --save-dev jest jest-environment-jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event ts-jest @types/jest @types/sharp
```

Expected: Dev-Pakete installiert.

- [ ] **Step 4: next.config.ts erstellen**

Ersetze den Inhalt von `next.config.ts`:

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
```

- [ ] **Step 5: jest.config.ts erstellen**

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
}

export default createJestConfig(config)
```

- [ ] **Step 6: jest.setup.ts erstellen**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 7: .env.local erstellen**

```
ANTHROPIC_API_KEY=dein_key_hier
BLOB_READ_WRITE_TOKEN=dein_token_hier
```

- [ ] **Step 8: .gitignore aktualisieren — .env.local und .superpowers eintragen**

```bash
echo ".env.local" >> .gitignore
echo ".superpowers/" >> .gitignore
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: project setup — Next.js 15, dependencies, jest config"
```

---

### Task 2: TypeScript Types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: lib/types.ts erstellen**

```typescript
export interface BoundingBox {
  x: number      // % von links (0–100)
  y: number      // % von oben (0–100)
  width: number  // % der Seitenbreite (0–100)
  height: number // % der Seitenhöhe (0–100)
}

export interface Product {
  id: string
  name: string
  description: string
  price: string
  salePrice?: string
  position: BoundingBox
  pageNumber: number
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
git commit -m "feat: add TypeScript type definitions"
```

---

### Task 3: Zustand Store

**Files:**
- Create: `lib/store.ts`
- Create: `__tests__/lib/store.test.ts`

- [ ] **Step 1: Failing test schreiben**

Erstelle `__tests__/lib/store.test.ts`:

```typescript
import { act, renderHook } from '@testing-library/react'
import { useAppStore } from '@/lib/store'

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
  })

  it('hat initialen Zustand', () => {
    const { result } = renderHook(() => useAppStore())
    expect(result.current.sessionId).toBeNull()
    expect(result.current.products).toEqual([])
    expect(result.current.edits).toEqual({})
    expect(result.current.activeProductId).toBeNull()
  })

  it('setzt Session korrekt', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setSession('session-123', 'https://blob.example.com/pdf.pdf')
    })
    expect(result.current.sessionId).toBe('session-123')
    expect(result.current.originalPdfUrl).toBe('https://blob.example.com/pdf.pdf')
  })

  it('aktualisiert ein Produkt-Edit', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.updateEdit('prod-1', { name: 'Neues Produkt', active: true })
    })
    expect(result.current.edits['prod-1'].name).toBe('Neues Produkt')
    expect(result.current.edits['prod-1'].active).toBe(true)
  })

  it('merged Edit statt zu überschreiben', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.updateEdit('prod-1', { name: 'Name', active: true })
      result.current.updateEdit('prod-1', { price: '3,99 €' })
    })
    expect(result.current.edits['prod-1'].name).toBe('Name')
    expect(result.current.edits['prod-1'].price).toBe('3,99 €')
  })

  it('reset() löscht allen Zustand', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setSession('s', 'url')
      result.current.updateEdit('p', { active: true })
      result.current.reset()
    })
    expect(result.current.sessionId).toBeNull()
    expect(result.current.edits).toEqual({})
  })
})
```

- [ ] **Step 2: Test laufen lassen — erwartet Fehler**

```bash
npx jest __tests__/lib/store.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/store'`

- [ ] **Step 3: lib/store.ts implementieren**

```typescript
import { create } from 'zustand'
import type { Product, ProductEdit, PageImage } from '@/lib/types'

interface AppState {
  sessionId: string | null
  originalPdfUrl: string | null
  generatedPdfUrl: string | null
  pages: PageImage[]
  products: Product[]
  edits: Record<string, ProductEdit>
  activeProductId: string | null

  setSession: (sessionId: string, pdfUrl: string) => void
  setPages: (pages: PageImage[]) => void
  setProducts: (products: Product[]) => void
  setGeneratedPdfUrl: (url: string) => void
  updateEdit: (productId: string, edit: Partial<ProductEdit>) => void
  setActiveProduct: (id: string | null) => void
  reset: () => void
}

const initialState = {
  sessionId: null,
  originalPdfUrl: null,
  generatedPdfUrl: null,
  pages: [],
  products: [],
  edits: {},
  activeProductId: null,
}

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setSession: (sessionId, pdfUrl) =>
    set({ sessionId, originalPdfUrl: pdfUrl }),

  setPages: (pages) => set({ pages }),

  setProducts: (products) =>
    set((state) => ({
      products,
      edits: Object.fromEntries(
        products.map((p) => [
          p.id,
          state.edits[p.id] ?? { active: true },
        ])
      ),
    })),

  setGeneratedPdfUrl: (url) => set({ generatedPdfUrl: url }),

  updateEdit: (productId, edit) =>
    set((state) => ({
      edits: {
        ...state.edits,
        [productId]: { ...state.edits[productId], ...edit },
      },
    })),

  setActiveProduct: (id) => set({ activeProductId: id }),

  reset: () => set(initialState),
}))
```

- [ ] **Step 4: Tests laufen lassen — erwartet grün**

```bash
npx jest __tests__/lib/store.test.ts --no-coverage
```

Expected: PASS — 5 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add lib/store.ts __tests__/lib/store.test.ts
git commit -m "feat: add Zustand store with tests"
```

---

### Task 4: Vercel Blob Utilities

**Files:**
- Create: `lib/blob.ts`

- [ ] **Step 1: lib/blob.ts erstellen**

```typescript
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
    pdfBytes,
    { access: 'public', contentType: 'application/pdf', addRandomSuffix: false }
  )
  return blob.url
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/blob.ts
git commit -m "feat: add Vercel Blob session utilities"
```

---

### Task 5: PDF-Generierungs-Utilities

**Files:**
- Create: `lib/pdf-generate.ts`
- Create: `__tests__/lib/pdf-generate.test.ts`

- [ ] **Step 1: Failing tests für Koordinaten-Konvertierung schreiben**

Erstelle `__tests__/lib/pdf-generate.test.ts`:

```typescript
import { convertBoundingBox, fitTextInBox } from '@/lib/pdf-generate'
import type { BoundingBox } from '@/lib/types'

describe('convertBoundingBox', () => {
  const pageWidth = 595
  const pageHeight = 842

  it('konvertiert % korrekt in PDF-Koordinaten', () => {
    const box: BoundingBox = { x: 10, y: 20, width: 30, height: 15 }
    const result = convertBoundingBox(box, pageWidth, pageHeight)

    expect(result.x).toBeCloseTo(59.5)
    // y von oben: 20%, height: 15% → untere Kante bei 35% von oben
    // pdf-lib y = von unten: pageHeight * (1 - 0.35) = 842 * 0.65 = 547.3
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

describe('fitTextInBox', () => {
  it('gibt 12 zurück wenn Text reinpasst', () => {
    const size = fitTextInBox('Kurzer Text', 200, 50, 12)
    expect(size).toBe(12)
  })

  it('reduziert Schriftgröße wenn Text zu lang', () => {
    const size = fitTextInBox('Sehr langer Produktname der nicht passt xxxxxxxxxxxxxxxxxx', 100, 20, 14)
    expect(size).toBeLessThan(14)
    expect(size).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Test laufen lassen — erwartet Fehler**

```bash
npx jest __tests__/lib/pdf-generate.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/pdf-generate'`

- [ ] **Step 3: lib/pdf-generate.ts implementieren**

```typescript
import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib'
import type { BoundingBox, Product, ProductEdit } from '@/lib/types'

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

/**
 * Berechnet die maximale Schriftgröße die in eine Box passt.
 * Approximiert: Zeichenbreite ≈ 0.6 × fontSize, Zeilenhöhe ≈ 1.2 × fontSize
 */
export function fitTextInBox(
  text: string,
  boxWidth: number,
  boxHeight: number,
  maxFontSize: number
): number {
  for (let size = maxFontSize; size >= 4; size--) {
    const approxWidth = text.length * 0.6 * size
    const approxHeight = 1.2 * size
    if (approxWidth <= boxWidth && approxHeight <= boxHeight) {
      return size
    }
  }
  return 4
}

function drawTextBlock(
  page: PDFPage,
  lines: string[],
  rect: PdfRect,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  maxFontSize = 12
) {
  const padding = 4
  const availWidth = rect.width - padding * 2
  const availHeight = rect.height - padding * 2

  lines.forEach((line, i) => {
    if (!line) return
    const fontSize = fitTextInBox(line, availWidth, availHeight / lines.length, maxFontSize)
    const lineY = rect.y + rect.height - padding - (i + 1) * fontSize * 1.3
    if (lineY >= rect.y) {
      page.drawText(line, {
        x: rect.x + padding,
        y: lineY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      })
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
  const pages = pdfDoc.getPages()

  for (const product of products) {
    const edit = edits[product.id]
    if (!edit || !edit.active) continue

    const pageIndex = product.pageNumber - 1
    if (pageIndex < 0 || pageIndex >= pages.length) continue
    const page = pages[pageIndex]
    const { width: pageWidth, height: pageHeight } = page.getSize()

    const position = edit.position ?? product.position
    const rect = convertBoundingBox(position, pageWidth, pageHeight)

    // 1. Weißes Rechteck über Original
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: rgb(1, 1, 1),
    })

    // 2. Ersatzbild einbetten falls vorhanden
    if (edit.replacementImage) {
      try {
        const sharp = (await import('sharp')).default
        const base64Data = edit.replacementImage.replace(/^data:image\/\w+;base64,/, '')
        const rawBytes = Buffer.from(base64Data, 'base64')
        // Mit sharp auf Boxgröße skalieren und als JPEG exportieren
        const targetW = Math.round(rect.width * 2)  // 2x für höhere Auflösung im PDF
        const targetH = Math.round(rect.height * 2 * 0.6)
        const jpegBytes = await sharp(rawBytes)
          .resize(targetW, targetH, { fit: 'inside' })
          .jpeg({ quality: 85 })
          .toBuffer()
        const image = await pdfDoc.embedJpg(jpegBytes)
        page.drawImage(image, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height * 0.6,
        })
      } catch {
        // Bild-Einbettung ignorieren wenn fehlerhaft
      }
    }

    // 3. Text einzeichnen
    const name = edit.name ?? product.name
    const description = edit.description ?? product.description
    const price = edit.salePrice ?? edit.price ?? product.salePrice ?? product.price

    drawTextBlock(
      page,
      [name, description, price].filter(Boolean),
      rect,
      helveticaBold,
      14
    )
  }

  return pdfDoc.save()
}
```

- [ ] **Step 4: Tests laufen lassen — erwartet grün**

```bash
npx jest __tests__/lib/pdf-generate.test.ts --no-coverage
```

Expected: PASS — 4 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add lib/pdf-generate.ts __tests__/lib/pdf-generate.test.ts
git commit -m "feat: add PDF generation utilities with coordinate conversion"
```

---

### Task 6: PDF Client Rendering (Browser)

**Files:**
- Create: `lib/pdf-client.ts`

- [ ] **Step 1: lib/pdf-client.ts erstellen**

Diese Datei läuft nur im Browser. pdfjs-dist braucht den Worker über CDN.

```typescript
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
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
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
```

- [ ] **Step 2: Commit**

```bash
git add lib/pdf-client.ts
git commit -m "feat: add pdfjs-dist client rendering utilities"
```

---

### Task 7: Server Actions

**Files:**
- Create: `actions/upload.ts`
- Create: `actions/extract.ts`
- Create: `actions/session.ts`
- Create: `actions/generate.ts`

- [ ] **Step 1: actions/upload.ts erstellen**

```typescript
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
      pageCount: 0, // wird nach Client-Rendering befüllt
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
```

- [ ] **Step 2: actions/extract.ts erstellen**

```typescript
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
        const parsed = JSON.parse(text) as Product[]
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
    console.error('extractProducts error:', e)
    return { success: false, error: 'Extraktion fehlgeschlagen. Bitte erneut versuchen.' }
  }
}
```

- [ ] **Step 3: actions/session.ts erstellen**

```typescript
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
```

- [ ] **Step 4: actions/generate.ts erstellen**

```typescript
'use server'

import { loadSession, saveGeneratedPdf } from '@/lib/blob'
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

    return { success: true, generatedPdfUrl }
  } catch (e) {
    console.error('generatePdf error:', e)
    return { success: false, error: 'PDF-Generierung fehlgeschlagen.' }
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add actions/
git commit -m "feat: add all server actions (upload, extract, session, generate)"
```

---

### Task 8: UI Basis-Komponenten (Toast, Spinner)

**Files:**
- Create: `components/ui/Toast.tsx`
- Create: `components/ui/Spinner.tsx`
- Create: `lib/toast.ts`

- [ ] **Step 1: lib/toast.ts erstellen — einfacher Toast-State ohne externe Lib**

```typescript
import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastStore {
  toasts: ToastItem[]
  add: (message: string, type?: ToastType) => void
  remove: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 4000)
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (msg: string) => useToastStore.getState().add(msg, 'success'),
  error: (msg: string) => useToastStore.getState().add(msg, 'error'),
  info: (msg: string) => useToastStore.getState().add(msg, 'info'),
}
```

- [ ] **Step 2: components/ui/Toast.tsx erstellen**

```tsx
'use client'

import { useToastStore } from '@/lib/toast'

export function Toaster() {
  const { toasts, remove } = useToastStore()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => remove(t.id)}
          className={`cursor-pointer rounded-lg px-4 py-3 text-sm text-white shadow-lg transition-all ${
            t.type === 'success'
              ? 'bg-green-600'
              : t.type === 'error'
              ? 'bg-red-600'
              : 'bg-blue-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: components/ui/Spinner.tsx erstellen**

```tsx
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }[size]
  return (
    <div
      className={`${sizeClass} animate-spin rounded-full border-2 border-blue-200 border-t-blue-600`}
      role="status"
      aria-label="Laden..."
    />
  )
}
```

- [ ] **Step 4: app/layout.tsx aktualisieren — Toaster einbinden**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/Toast'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ApothekenAnzeigen-Editor',
  description: 'Apotheken-Werbeflyer einfach bearbeiten',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className={inter.className}>
        {children}
        <Toaster />
      </body>
    </html>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/ui/ lib/toast.ts app/layout.tsx
git commit -m "feat: add Toast and Spinner UI components"
```

---

### Task 9: DropZone Komponente

**Files:**
- Create: `components/upload/DropZone.tsx`
- Create: `components/upload/ExtractionProgress.tsx`
- Create: `__tests__/components/DropZone.test.tsx`

- [ ] **Step 1: Failing test schreiben**

Erstelle `__tests__/components/DropZone.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { DropZone } from '@/components/upload/DropZone'

describe('DropZone', () => {
  it('zeigt Upload-Aufforderung an', () => {
    render(<DropZone onFile={jest.fn()} />)
    expect(screen.getByText(/PDF-Datei/i)).toBeInTheDocument()
  })

  it('ist deaktiviert während Upload läuft', () => {
    render(<DropZone onFile={jest.fn()} disabled />)
    const zone = screen.getByRole('button')
    expect(zone).toHaveAttribute('aria-disabled', 'true')
  })
})
```

- [ ] **Step 2: Test laufen lassen — erwartet Fehler**

```bash
npx jest __tests__/components/DropZone.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: components/upload/DropZone.tsx implementieren**

```tsx
'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

interface DropZoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export function DropZone({ onFile, disabled = false }: DropZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0])
    },
    [onFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      role="button"
      aria-disabled={disabled}
      className={`flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
          : 'border-blue-300 bg-white hover:border-blue-500 hover:bg-blue-50'
      }`}
    >
      <input {...getInputProps()} />
      <div className="text-4xl mb-3">📄</div>
      <p className="text-lg font-medium text-blue-700">
        PDF-Datei hier ablegen
      </p>
      <p className="mt-1 text-sm text-gray-500">
        oder klicken zum Auswählen
      </p>
    </div>
  )
}
```

- [ ] **Step 4: components/upload/ExtractionProgress.tsx erstellen**

```tsx
interface ExtractionProgressProps {
  currentPage: number
  totalPages: number
}

export function ExtractionProgress({ currentPage, totalPages }: ExtractionProgressProps) {
  const percent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-between text-sm text-gray-600">
        <span>Produkte werden extrahiert…</span>
        <span>
          Seite {currentPage} von {totalPages}
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-blue-100">
        <div
          className="h-3 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Tests laufen lassen — erwartet grün**

```bash
npx jest __tests__/components/DropZone.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/upload/ __tests__/components/DropZone.test.tsx
git commit -m "feat: add DropZone and ExtractionProgress components"
```

---

### Task 10: Upload-Seite

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: app/page.tsx erstellen**

```tsx
'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DropZone } from '@/components/upload/DropZone'
import { ExtractionProgress } from '@/components/upload/ExtractionProgress'
import { Spinner } from '@/components/ui/Spinner'
import { uploadPdf } from '@/actions/upload'
import { extractProducts } from '@/actions/extract'
import { renderPdfPages } from '@/lib/pdf-client'
import { useAppStore } from '@/lib/store'
import { toast } from '@/lib/toast'

type Status =
  | { type: 'idle' }
  | { type: 'uploading' }
  | { type: 'rendering' }
  | { type: 'extracting'; current: number; total: number }
  | { type: 'error'; message: string }

export default function UploadPage() {
  const router = useRouter()
  const { setSession, setPages, setProducts } = useAppStore()
  const [status, setStatus] = useState<Status>({ type: 'idle' })

  const handleFile = useCallback(async (file: File) => {
    setStatus({ type: 'uploading' })

    // 1. PDF hochladen
    const formData = new FormData()
    formData.append('pdf', file)
    const uploadResult = await uploadPdf(formData)
    if (!uploadResult.success) {
      setStatus({ type: 'error', message: uploadResult.error })
      toast.error(uploadResult.error)
      return
    }

    const { sessionId, pdfBlobUrl } = uploadResult.data
    setSession(sessionId, pdfBlobUrl)

    // 2. PDF client-seitig rendern
    setStatus({ type: 'rendering' })
    const pdfBuffer = await file.arrayBuffer()
    const pages = await renderPdfPages(pdfBuffer, (current, total) => {
      setStatus({ type: 'extracting', current, total })
    })
    setPages(pages)

    // 3. Produkte per Claude extrahieren
    setStatus({ type: 'extracting', current: 0, total: pages.length })
    const extractResult = await extractProducts(sessionId, pages)
    if (!extractResult.success) {
      setStatus({ type: 'error', message: extractResult.error })
      toast.error(extractResult.error)
      return
    }

    if (extractResult.products.length === 0) {
      setStatus({ type: 'error', message: 'Keine Produkte im PDF erkannt.' })
      toast.error('Keine Produkte gefunden. Bitte ein anderes PDF versuchen.')
      return
    }

    setProducts(extractResult.products)
    toast.success(`${extractResult.products.length} Produkte gefunden!`)
    router.push(`/editor?session=${sessionId}`)
  }, [router, setSession, setPages, setProducts])

  const isLoading = status.type !== 'idle' && status.type !== 'error'

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      <div className="mx-auto max-w-2xl px-4 py-16">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="mb-3 text-5xl">💊</div>
          <h1 className="text-3xl font-bold text-blue-900">
            ApothekenAnzeigen-Editor
          </h1>
          <p className="mt-2 text-gray-600">
            Werbeflyer-PDF hochladen und Produkte einfach austauschen
          </p>
        </div>

        {/* Upload-Bereich */}
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-blue-100">
          {status.type === 'extracting' ? (
            <ExtractionProgress
              currentPage={status.current}
              totalPages={status.total}
            />
          ) : status.type === 'uploading' || status.type === 'rendering' ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Spinner size="lg" />
              <p className="text-gray-600">
                {status.type === 'uploading' ? 'Wird hochgeladen…' : 'PDF wird verarbeitet…'}
              </p>
            </div>
          ) : (
            <DropZone onFile={handleFile} disabled={isLoading} />
          )}

          {status.type === 'error' && (
            <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {status.message}
              <button
                onClick={() => setStatus({ type: 'idle' })}
                className="ml-3 underline"
              >
                Erneut versuchen
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Unterstützt mehrseitige PDF-Dateien · Maximale Dateigröße: 10 MB
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: App starten und Upload-Seite prüfen**

```bash
npm run dev
```

Öffne http://localhost:3000 — Seite sollte laden mit DropZone.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: implement upload page with PDF rendering and Claude extraction"
```

---

### Task 11: PdfCanvas Komponente

**Files:**
- Create: `components/editor/PdfCanvas.tsx`

- [ ] **Step 1: components/editor/PdfCanvas.tsx erstellen**

Diese Komponente rendert eine PDF-Seite als `<img>` aus dem Zustand-Store (bereits als base64 gerendert).

```tsx
'use client'

import Image from 'next/image'
import { useAppStore } from '@/lib/store'
import { Spinner } from '@/components/ui/Spinner'

interface PdfCanvasProps {
  pageNumber: number
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function PdfCanvas({ pageNumber, containerRef }: PdfCanvasProps) {
  const pages = useAppStore((s) => s.pages)
  const page = pages.find((p) => p.pageNumber === pageNumber)

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full select-none">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={page.dataUrl}
        alt={`Seite ${pageNumber}`}
        className="w-full rounded shadow-md"
        draggable={false}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/editor/PdfCanvas.tsx
git commit -m "feat: add PdfCanvas component"
```

---

### Task 12: BoundingBoxOverlay Komponente

**Files:**
- Create: `components/editor/BoundingBoxOverlay.tsx`

- [ ] **Step 1: components/editor/BoundingBoxOverlay.tsx erstellen**

```tsx
'use client'

import { useRef, useCallback } from 'react'
import type { BoundingBox, Product } from '@/lib/types'

interface BoundingBoxOverlayProps {
  products: Product[]
  edits: Record<string, { position?: BoundingBox; active: boolean }>
  activeProductId: string | null
  containerWidth: number
  containerHeight: number
  onProductClick: (id: string) => void
  onPositionChange: (productId: string, newPosition: BoundingBox) => void
}

const HANDLE_POSITIONS = [
  'nw', 'n', 'ne',
  'w',        'e',
  'sw', 's', 'se',
] as const

type HandlePosition = typeof HANDLE_POSITIONS[number]

function getHandleStyle(pos: HandlePosition): React.CSSProperties {
  const isNorth = pos.includes('n')
  const isSouth = pos.includes('s')
  const isWest = pos.includes('w')
  const isEast = pos.includes('e')
  return {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#2563eb',
    border: '1px solid white',
    borderRadius: 2,
    top: isNorth ? -5 : isSouth ? undefined : '50%',
    bottom: isSouth ? -5 : undefined,
    left: isWest ? -5 : isEast ? undefined : '50%',
    right: isEast ? -5 : undefined,
    transform:
      pos === 'n' || pos === 's' ? 'translateX(-50%)'
      : pos === 'w' || pos === 'e' ? 'translateY(-50%)'
      : undefined,
    cursor: `${pos}-resize`,
    zIndex: 10,
  }
}

export function BoundingBoxOverlay({
  products,
  edits,
  activeProductId,
  containerWidth,
  containerHeight,
  onProductClick,
  onPositionChange,
}: BoundingBoxOverlayProps) {
  const dragState = useRef<{
    productId: string
    handle: HandlePosition | 'move'
    startX: number
    startY: number
    startBox: BoundingBox
  } | null>(null)

  const toPercent = useCallback(
    (px: number, axis: 'x' | 'y') =>
      (px / (axis === 'x' ? containerWidth : containerHeight)) * 100,
    [containerWidth, containerHeight]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, productId: string, handle: HandlePosition | 'move') => {
      e.preventDefault()
      e.stopPropagation()
      const edit = edits[productId]
      const product = products.find((p) => p.id === productId)
      const box = edit?.position ?? product?.position
      if (!box) return
      dragState.current = {
        productId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startBox: { ...box },
      }
      onProductClick(productId)
    },
    [edits, products, onProductClick]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState.current) return
      const { productId, handle, startX, startY, startBox } = dragState.current
      const dx = toPercent(e.clientX - startX, 'x')
      const dy = toPercent(e.clientY - startY, 'y')

      let newBox = { ...startBox }

      if (handle === 'move') {
        newBox.x = Math.max(0, Math.min(100 - startBox.width, startBox.x + dx))
        newBox.y = Math.max(0, Math.min(100 - startBox.height, startBox.y + dy))
      } else {
        if (handle.includes('e')) {
          newBox.width = Math.max(5, startBox.width + dx)
        }
        if (handle.includes('s')) {
          newBox.height = Math.max(5, startBox.height + dy)
        }
        if (handle.includes('w')) {
          newBox.x = startBox.x + dx
          newBox.width = Math.max(5, startBox.width - dx)
        }
        if (handle.includes('n')) {
          newBox.y = startBox.y + dy
          newBox.height = Math.max(5, startBox.height - dy)
        }
      }

      onPositionChange(productId, newBox)
    },
    [toPercent, onPositionChange]
  )

  const handleMouseUp = useCallback(() => {
    dragState.current = null
  }, [])

  return (
    <div
      className="absolute inset-0"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {products.map((product) => {
        const edit = edits[product.id]
        if (!edit?.active) return null
        const box = edit.position ?? product.position
        const isActive = product.id === activeProductId

        return (
          <div
            key={product.id}
            style={{
              position: 'absolute',
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
              border: `2px solid ${isActive ? '#2563eb' : '#93c5fd'}`,
              background: isActive ? 'rgba(37,99,235,0.08)' : 'rgba(147,197,253,0.05)',
              cursor: 'move',
              boxSizing: 'border-box',
            }}
            onMouseDown={(e) => handleMouseDown(e, product.id, 'move')}
          >
            {/* Produkt-Label */}
            <div
              className="absolute -top-5 left-0 max-w-full truncate rounded-t bg-blue-600 px-1 text-xs text-white"
              style={{ fontSize: 10, whiteSpace: 'nowrap' }}
            >
              {product.name}
            </div>

            {/* Resize Handles — nur für aktives Produkt */}
            {isActive &&
              HANDLE_POSITIONS.map((pos) => (
                <div
                  key={pos}
                  style={getHandleStyle(pos)}
                  onMouseDown={(e) => handleMouseDown(e, product.id, pos)}
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/editor/BoundingBoxOverlay.tsx
git commit -m "feat: add BoundingBoxOverlay with drag/resize handles"
```

---

### Task 13: ProductCard & ProductList

**Files:**
- Create: `components/editor/ProductCard.tsx`
- Create: `components/editor/ProductList.tsx`
- Create: `__tests__/components/ProductCard.test.tsx`

- [ ] **Step 1: Failing test schreiben**

Erstelle `__tests__/components/ProductCard.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductCard } from '@/components/editor/ProductCard'
import type { Product, ProductEdit } from '@/lib/types'

const product: Product = {
  id: 'p1',
  name: 'Aspirin 500mg',
  description: 'Schmerzmittel',
  price: '3,99 €',
  position: { x: 10, y: 10, width: 30, height: 20 },
  pageNumber: 1,
}

const edit: ProductEdit = { active: true }

describe('ProductCard', () => {
  it('zeigt Produktname an', () => {
    render(<ProductCard product={product} edit={edit} isActive={false} onChange={jest.fn()} onSelect={jest.fn()} />)
    expect(screen.getByDisplayValue('Aspirin 500mg')).toBeInTheDocument()
  })

  it('ruft onChange beim Bearbeiten auf', () => {
    const onChange = jest.fn()
    render(<ProductCard product={product} edit={edit} isActive={false} onChange={onChange} onSelect={jest.fn()} />)
    const input = screen.getByDisplayValue('Aspirin 500mg')
    fireEvent.change(input, { target: { value: 'Aspirin Plus' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aspirin Plus' }))
  })

  it('zeigt Toggle aktiv/inaktiv', () => {
    const onChange = jest.fn()
    render(<ProductCard product={product} edit={edit} isActive={false} onChange={onChange} onSelect={jest.fn()} />)
    const toggle = screen.getByRole('checkbox')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ active: false }))
  })
})
```

- [ ] **Step 2: Test laufen lassen — erwartet Fehler**

```bash
npx jest __tests__/components/ProductCard.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: components/editor/ProductCard.tsx erstellen**

```tsx
'use client'

import { useRef } from 'react'
import type { Product, ProductEdit } from '@/lib/types'

interface ProductCardProps {
  product: Product
  edit: ProductEdit
  isActive: boolean
  onChange: (edit: Partial<ProductEdit>) => void
  onSelect: () => void
}

export function ProductCard({ product, edit, isActive, onChange, onSelect }: ProductCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onChange({ replacementImage: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
        isActive
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : edit.active
          ? 'border-gray-200 bg-white hover:border-blue-300'
          : 'border-gray-100 bg-gray-50 opacity-50'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">
          Seite {product.pageNumber}
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={edit.active}
            onChange={(e) => onChange({ active: e.target.checked })}
            onClick={(e) => e.stopPropagation()}
            className="accent-blue-600"
          />
          Ersetzen
        </label>
      </div>

      {/* Felder */}
      <div className="space-y-2">
        <input
          type="text"
          value={edit.name ?? product.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Produktname"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          value={edit.description ?? product.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Beschreibung"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={edit.price ?? product.price}
            onChange={(e) => onChange({ price: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Preis"
            className="w-1/2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={edit.salePrice ?? product.salePrice ?? ''}
            onChange={(e) => onChange({ salePrice: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Aktionspreis"
            className="w-1/2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Bild-Upload */}
      <div className="mt-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          {edit.replacementImage ? '✓ Bild hochgeladen' : '+ Ersatzbild hochladen'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: components/editor/ProductList.tsx erstellen**

```tsx
'use client'

import { ProductCard } from './ProductCard'
import type { Product, ProductEdit } from '@/lib/types'

interface ProductListProps {
  products: Product[]
  edits: Record<string, ProductEdit>
  activeProductId: string | null
  onEditChange: (productId: string, edit: Partial<ProductEdit>) => void
  onProductSelect: (productId: string) => void
}

export function ProductList({
  products,
  edits,
  activeProductId,
  onEditChange,
  onProductSelect,
}: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        Keine Produkte gefunden
      </div>
    )
  }

  return (
    <div className="space-y-3 overflow-y-auto pr-1">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          edit={edits[product.id] ?? { active: true }}
          isActive={product.id === activeProductId}
          onChange={(edit) => onEditChange(product.id, edit)}
          onSelect={() => onProductSelect(product.id)}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Tests laufen lassen — erwartet grün**

```bash
npx jest __tests__/components/ProductCard.test.tsx --no-coverage
```

Expected: PASS — 3 Tests grün.

- [ ] **Step 6: Commit**

```bash
git add components/editor/ProductCard.tsx components/editor/ProductList.tsx __tests__/components/ProductCard.test.tsx
git commit -m "feat: add ProductCard and ProductList components with tests"
```

---

### Task 14: Editor-Seite

**Files:**
- Create: `app/editor/page.tsx`

- [ ] **Step 1: app/editor/page.tsx erstellen**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { PdfCanvas } from '@/components/editor/PdfCanvas'
import { BoundingBoxOverlay } from '@/components/editor/BoundingBoxOverlay'
import { ProductList } from '@/components/editor/ProductList'
import { Spinner } from '@/components/ui/Spinner'
import { loadSession } from '@/actions/session'
import { saveSession } from '@/actions/session'
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

export default function EditorPage() {
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
  const containerRef = useRef<HTMLDivElement>(null)
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
  }, [sessionId, products.length, router, setSession, setProducts])

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
```

- [ ] **Step 2: Commit**

```bash
git add app/editor/page.tsx
git commit -m "feat: implement editor page with canvas, overlay and product list"
```

---

### Task 15: Download-Seite

**Files:**
- Create: `components/download/PdfComparison.tsx`
- Create: `app/download/page.tsx`

- [ ] **Step 1: components/download/PdfComparison.tsx erstellen**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { renderPdfPages } from '@/lib/pdf-client'
import { Spinner } from '@/components/ui/Spinner'
import type { PageImage } from '@/lib/types'

interface PdfComparisonProps {
  originalUrl: string
  generatedUrl: string
}

export function PdfComparison({ originalUrl, generatedUrl }: PdfComparisonProps) {
  const [originalPages, setOriginalPages] = useState<PageImage[]>([])
  const [generatedPages, setGeneratedPages] = useState<PageImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [origResp, genResp] = await Promise.all([
        fetch(originalUrl),
        fetch(generatedUrl),
      ])
      const [origBuf, genBuf] = await Promise.all([
        origResp.arrayBuffer(),
        genResp.arrayBuffer(),
      ])
      const [orig, gen] = await Promise.all([
        renderPdfPages(origBuf),
        renderPdfPages(genBuf),
      ])
      setOriginalPages(orig)
      setGeneratedPages(gen)
      setLoading(false)
    }
    load()
  }, [originalUrl, generatedUrl])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-gray-500">
        <Spinner /> <span>PDFs werden gerendert…</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {originalPages.map((orig, i) => {
        const gen = generatedPages[i]
        return (
          <div key={orig.pageNumber}>
            <div className="mb-2 text-sm font-medium text-gray-500">Seite {orig.pageNumber}</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Original</div>
                <img src={orig.dataUrl} alt={`Original Seite ${orig.pageNumber}`} className="w-full rounded shadow" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-blue-500 uppercase tracking-wide">Neu</div>
                <img src={gen?.dataUrl} alt={`Neu Seite ${orig.pageNumber}`} className="w-full rounded shadow ring-2 ring-blue-400" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: app/download/page.tsx erstellen**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useAppStore } from '@/lib/store'
import { loadSession } from '@/actions/session'
import { Spinner } from '@/components/ui/Spinner'
import { toast } from '@/lib/toast'

// PdfComparison nutzt pdfjs-dist → nur client-seitig laden
const PdfComparison = dynamic(
  () => import('@/components/download/PdfComparison').then((m) => m.PdfComparison),
  { ssr: false, loading: () => <div className="flex h-64 items-center justify-center"><Spinner /></div> }
)

export default function DownloadPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const { originalPdfUrl, generatedPdfUrl } = useAppStore()
  const [origUrl, setOrigUrl] = useState(originalPdfUrl)
  const [genUrl, setGenUrl] = useState(generatedPdfUrl)
  const [loading, setLoading] = useState(!originalPdfUrl || !generatedPdfUrl)

  useEffect(() => {
    if (origUrl && genUrl) return
    if (!sessionId) { router.push('/'); return }

    // Fallback: Session aus Blob laden
    loadSession(sessionId).then((result) => {
      if (!result.success) {
        toast.error('Sitzung nicht gefunden.')
        router.push('/')
        return
      }
      setOrigUrl(result.session.pdfBlobUrl)
      setLoading(false)
    })
  }, [sessionId, origUrl, genUrl, router])

  const handleDownload = () => {
    if (!genUrl) return
    const a = document.createElement('a')
    a.href = genUrl
    a.download = `apotheke-anzeige-neu.pdf`
    a.click()
  }

  if (loading || !origUrl || !genUrl) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-10">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-blue-900">Fertig!</h1>
            <p className="text-gray-500">Vorher/Nachher-Vergleich</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/editor?session=${sessionId}`)}
              className="rounded-lg border border-blue-300 px-4 py-2 text-sm text-blue-600 hover:bg-blue-50"
            >
              ← Zurück zum Editor
            </button>
            <button
              onClick={handleDownload}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              📥 Neue Anzeige herunterladen
            </button>
          </div>
        </div>

        {/* Vergleich */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <PdfComparison originalUrl={origUrl} generatedUrl={genUrl} />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/download/ app/download/page.tsx
git commit -m "feat: implement download page with before/after comparison"
```

---

### Task 16: Gesamttest & Deployment-Vorbereitung

**Files:**
- Create: `vercel.json`
- Modify: `.gitignore`

- [ ] **Step 1: Alle Tests laufen lassen**

```bash
npx jest --no-coverage
```

Expected: Alle Tests grün — kein FAIL.

- [ ] **Step 2: Build prüfen**

```bash
npm run build
```

Expected: Build erfolgreich, keine TypeScript-Fehler.

- [ ] **Step 3: vercel.json erstellen**

```json
{
  "functions": {
    "app/editor/page.tsx": { "maxDuration": 60 },
    "actions/extract.ts": { "maxDuration": 120 }
  }
}
```

- [ ] **Step 4: Lint prüfen**

```bash
npm run lint
```

Expected: Keine Fehler.

- [ ] **Step 5: Abschließender Commit**

```bash
git add -A
git commit -m "feat: complete ApothekenAnzeigen-Editor — all pages, actions, tests"
```

- [ ] **Step 6: Deployment**

```bash
# Vercel CLI installieren falls nicht vorhanden
npm install -g vercel

# Deployment (folge den Anweisungen, Umgebungsvariablen in Vercel Dashboard eintragen)
vercel
```

Umgebungsvariablen in Vercel Dashboard eintragen:
- `ANTHROPIC_API_KEY`
- `BLOB_READ_WRITE_TOKEN`

---

## Bekannte Einschränkungen

- **Schriften:** pdf-lib kann Original-PDF-Schriften nicht extrahieren → immer Helvetica als Ersatz
- **Seiten-Reload im Editor:** PDF-Seiten werden bei Session-Wiederherstellung erneut client-seitig gerendert (dauert wenige Sekunden)
