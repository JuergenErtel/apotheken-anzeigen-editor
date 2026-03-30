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
