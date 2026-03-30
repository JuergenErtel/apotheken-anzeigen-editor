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
  // In Node.js (Server Actions, Jest), pdfjs uses a fake/inline worker.
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = workerPath

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
