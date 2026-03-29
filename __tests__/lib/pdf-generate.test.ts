/**
 * @jest-environment node
 */
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
