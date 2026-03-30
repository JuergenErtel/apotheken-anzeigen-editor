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
