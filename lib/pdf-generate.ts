import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib'
import type { BoundingBox, TextElement, Product, ProductEdit } from '@/lib/types'

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

/** Findet die größte Schriftgröße mit der `text` in `maxWidth` passt. */
function fitFontSize(text: string, font: PDFFont, maxWidth: number, maxFontSize: number): number {
  for (let size = Math.ceil(maxFontSize); size >= 4; size--) {
    if (font.widthOfTextAtSize(text, size) <= maxWidth) return size
  }
  return 4
}

/** Zeichnet einen Text in eine exakte TextElement-Box mit Original-Stil. */
function drawTextElement(
  page: PDFPage,
  text: string,
  element: TextElement,
  fonts: { regular: PDFFont; bold: PDFFont },
  pageWidth: number,
  pageHeight: number
) {
  if (!text.trim()) return
  const font = element.fontBold ? fonts.bold : fonts.regular
  const rect = convertBoundingBox(element.position, pageWidth, pageHeight)
  const fontSize = fitFontSize(text, font, rect.width, element.fontSize)
  const color = rgb(
    element.textColor.r / 255,
    element.textColor.g / 255,
    element.textColor.b / 255
  )
  // Vertikal zentriert in der Box
  const y = rect.y + (rect.height - fontSize) / 2
  page.drawText(text, { x: rect.x, y, size: fontSize, font, color })
}

/** Fallback: alle Felder in eine gemeinsame Box, wenn keine TextElements vorhanden. */
function drawTextBlockFallback(
  page: PDFPage,
  lines: string[],
  rect: PdfRect,
  font: PDFFont,
  maxFontSize: number,
  textColor: { r: number; g: number; b: number }
) {
  const padding = 4
  const availWidth = rect.width - padding * 2
  const color = rgb(textColor.r / 255, textColor.g / 255, textColor.b / 255)

  lines.forEach((line, i) => {
    if (!line) return
    const fontSize = fitFontSize(line, font, availWidth, maxFontSize)
    const lineY = rect.y + rect.height - padding - (i + 1) * fontSize * 1.3
    if (lineY >= rect.y) {
      page.drawText(line, { x: rect.x + padding, y: lineY, size: fontSize, font, color })
    }
  })
}

export async function applyProductReplacements(
  originalPdfBytes: ArrayBuffer,
  products: Product[],
  edits: Record<string, ProductEdit>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes)
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const fonts = { regular: helvetica, bold: helveticaBold }
  const pages = pdfDoc.getPages()

  for (const product of products) {
    const edit = edits[product.id]
    if (!edit?.active) continue

    const pageIndex = product.pageNumber - 1
    if (pageIndex < 0 || pageIndex >= pages.length) continue
    const page = pages[pageIndex]
    const { width: pageWidth, height: pageHeight } = page.getSize()

    const position = edit.position ?? product.position
    const rect = convertBoundingBox(position, pageWidth, pageHeight)

    // Union mit imagePosition damit das Deckweiß auch das Bild abdeckt
    let coverRect = rect
    if (product.imagePosition) {
      const imgCover = convertBoundingBox(product.imagePosition, pageWidth, pageHeight)
      coverRect = {
        x: Math.min(rect.x, imgCover.x),
        y: Math.min(rect.y, imgCover.y),
        width: Math.max(rect.x + rect.width, imgCover.x + imgCover.width) - Math.min(rect.x, imgCover.x),
        height: Math.max(rect.y + rect.height, imgCover.y + imgCover.height) - Math.min(rect.y, imgCover.y),
      }
    }

    // 1. Weißes Rechteck über Original
    const coverMargin = 4
    page.drawRectangle({
      x: coverRect.x - coverMargin,
      y: coverRect.y - coverMargin,
      width: coverRect.width + coverMargin * 2,
      height: coverRect.height + coverMargin * 2,
      color: rgb(1, 1, 1),
      borderWidth: 0,
    })

    // 2. Ersatzbild einbetten — füllt die volle imagePosition-Box
    if (edit.replacementImage) {
      const imgPos = product.imagePosition ?? product.position
      const imgRect = convertBoundingBox(imgPos, pageWidth, pageHeight)
      try {
        const sharp = (await import('sharp')).default
        const base64Data = edit.replacementImage.replace(/^data:image\/\w+;base64,/, '')
        const rawBytes = Buffer.from(base64Data, 'base64')
        const jpegBytes = await sharp(rawBytes)
          .resize(Math.round(imgRect.width * 2), Math.round(imgRect.height * 2), { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .jpeg({ quality: 85 })
          .toBuffer()
        const image = await pdfDoc.embedJpg(jpegBytes)
        page.drawImage(image, {
          x: imgRect.x,
          y: imgRect.y,
          width: imgRect.width,
          height: imgRect.height,
        })
      } catch {
        // Bild-Einbettung ignorieren wenn fehlerhaft
      }
    }

    // 3. Text: exakte TextElement-Boxen wenn vorhanden, sonst Fallback
    const name = edit.name ?? product.name
    const description = edit.description ?? product.description

    // For the TextElement path: split original price and sale price
    const originalPrice = edit.price ?? product.price
    const salePrice = edit.salePrice ?? product.salePrice

    // For the fallback path (keep using the combined logic):
    const fallbackPrice = edit.salePrice ?? edit.price ?? product.salePrice ?? product.price

    const hasTextElements = !!(product.nameElement || product.descriptionElement || product.priceElement)

    if (hasTextElements) {
      if (product.nameElement && name) {
        drawTextElement(page, name, product.nameElement, fonts, pageWidth, pageHeight)
      }
      if (product.descriptionElement && description) {
        drawTextElement(page, description, product.descriptionElement, fonts, pageWidth, pageHeight)
      }
      if (product.priceElement && originalPrice) {
        drawTextElement(page, originalPrice, product.priceElement, fonts, pageWidth, pageHeight)
      }
      if (product.salePriceElement && salePrice) {
        drawTextElement(page, salePrice, product.salePriceElement, fonts, pageWidth, pageHeight)
      }
    } else {
      // Fallback für ältere Sessions ohne TextElements
      const font = product.fontBold === false ? helvetica : helveticaBold
      const maxFontSize = product.fontSize ?? 14
      const textColor = product.textColor ?? { r: 0, g: 0, b: 0 }
      drawTextBlockFallback(
        page,
        [name, description, fallbackPrice].filter(Boolean),
        rect,
        font,
        maxFontSize,
        textColor
      )
    }
  }

  return pdfDoc.save()
}
