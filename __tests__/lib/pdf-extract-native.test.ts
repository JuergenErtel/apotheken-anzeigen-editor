/**
 * @jest-environment node
 */
import { extractNativeTextItems } from '@/lib/pdf-extract-native'
import { PDFDocument, StandardFonts } from 'pdf-lib'

jest.setTimeout(30000)

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
