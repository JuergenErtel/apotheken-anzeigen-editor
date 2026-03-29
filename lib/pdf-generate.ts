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
        const targetW = Math.round(rect.width * 2)
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
