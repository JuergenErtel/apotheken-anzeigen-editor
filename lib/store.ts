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
