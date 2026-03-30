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

/** Minimales DOMMatrix-Polyfill für pdfjs in Node.js (Vercel/Server Actions). */
function polyfillDOMMatrix() {
  if (typeof globalThis.DOMMatrix !== 'undefined') return
  class DOMMatrixPolyfill {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init
        this.m11 = init[0]; this.m12 = init[1]
        this.m21 = init[2]; this.m22 = init[3]
        this.m41 = init[4]; this.m42 = init[5]
      }
    }
    multiply(o: DOMMatrixPolyfill): DOMMatrixPolyfill {
      return new DOMMatrixPolyfill([
        this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b,
        this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d,
        this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f,
      ])
    }
    translate(tx: number, ty: number): DOMMatrixPolyfill {
      return new DOMMatrixPolyfill([this.a, this.b, this.c, this.d, this.e + tx * this.a + ty * this.c, this.f + tx * this.b + ty * this.d])
    }
    scale(sx: number, sy?: number): DOMMatrixPolyfill {
      const sY = sy ?? sx
      return new DOMMatrixPolyfill([this.a * sx, this.b * sx, this.c * sY, this.d * sY, this.e, this.f])
    }
    inverse(): DOMMatrixPolyfill {
      const det = this.a * this.d - this.b * this.c
      if (det === 0) return new DOMMatrixPolyfill()
      return new DOMMatrixPolyfill([
        this.d / det, -this.b / det, -this.c / det, this.a / det,
        (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det,
      ])
    }
    transformPoint(p: { x?: number; y?: number } = {}) {
      return { x: (p.x ?? 0) * this.a + (p.y ?? 0) * this.c + this.e, y: (p.x ?? 0) * this.b + (p.y ?? 0) * this.d + this.f, z: 0, w: 1 }
    }
  }
  ;(globalThis as Record<string, unknown>).DOMMatrix = DOMMatrixPolyfill
}

export async function extractNativeTextItems(
  pdfBytes: ArrayBuffer,
  pageNumber: number
): Promise<NativeTextItem[]> {
  polyfillDOMMatrix()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs v5 erwartet eine URL (nicht einen Dateipfad) für workerSrc.
  const { pathToFileURL } = await import('url')
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href

  const path = require('path')
  const standardFontDataUrl = path.join(require.resolve('pdfjs-dist/package.json'), '..', 'standard_fonts') + '/'
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBytes),
    standardFontDataUrl,
  })
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(pageNumber)
  const { width: pageWidth, height: pageHeight } = page.getViewport({ scale: 1 })

  // getTextContent liefert items + styles (fontFamily pro Alias).
  // Kein getOperatorList() nötig — vermeidet DOMMatrix-Abhängigkeit in Node.js.
  const content = await page.getTextContent()
  if (content.items.length === 0) return []

  const items: NativeTextItem[] = []

  content.items.forEach((raw, index) => {
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

    // content.styles liefert fontFamily (z.B. "Helvetica-Bold") pro Alias — kein commonObjs nötig.
    const styles = content.styles as Record<string, { fontFamily?: string }>
    const fontFamily = styles[item.fontName]?.fontFamily ?? item.fontName ?? ''
    const fontBold = /bold|heavy|black/i.test(fontFamily)
    const fontItalic = /italic|oblique/i.test(fontFamily)

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
      // Farbextraktion erfolgt in Phase 2 durch Claude (visuelle Erkennung).
      color: { r: 0, g: 0, b: 0 },
    })
  })

  return items
}
