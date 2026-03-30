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

/** Resolve actual font name from pdfjs commonObjs (populated after getOperatorList). */
async function resolveFontName(
  commonObjs: { get: (key: string, cb: (data: unknown) => void) => void },
  fontRef: string
): Promise<string> {
  return new Promise(resolve => {
    try {
      commonObjs.get(fontRef, (data: unknown) => {
        const fontData = data as { name?: string } | null
        resolve(fontData?.name ?? fontRef)
      })
    } catch {
      resolve(fontRef)
    }
  })
}

export async function extractNativeTextItems(
  pdfBytes: ArrayBuffer,
  pageNumber: number
): Promise<NativeTextItem[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // In Node.js (Server Actions, Jest), pdfjs uses a fake/inline worker.
  // The fake worker loads workerSrc via dynamic import — point it to the
  // bundled worker so it resolves without a separate process.
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

  // Trigger operator list evaluation to populate commonObjs with font data.
  await page.getOperatorList()

  const content = await page.getTextContent()
  if (content.items.length === 0) return []

  // Pre-resolve all unique font names from commonObjs.
  const commonObjs = (page as unknown as { commonObjs: { get: (key: string, cb: (data: unknown) => void) => void } }).commonObjs
  const uniqueFontRefs = new Set<string>()
  for (const raw of content.items) {
    if ('str' in raw && raw.str.trim() && 'fontName' in raw) {
      uniqueFontRefs.add((raw as { fontName: string }).fontName)
    }
  }

  const resolvedFontNames = new Map<string, string>()
  await Promise.all(
    Array.from(uniqueFontRefs).map(async ref => {
      const name = await resolveFontName(commonObjs, ref)
      resolvedFontNames.set(ref, name)
    })
  )

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

    // Use the resolved actual font name (e.g. "Helvetica-Bold") for style detection.
    const fontName = resolvedFontNames.get(item.fontName) ?? item.fontName ?? ''
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
      // Farbextraktion erfolgt in Phase 2 durch Claude (visuelle Erkennung).
      color: { r: 0, g: 0, b: 0 },
    })
  })

  return items
}
