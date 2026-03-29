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
