# Design: PDF-native Extraktion & korrektes Rendering

**Datum:** 2026-03-30
**Status:** Approved

## Problem

Das Ersetzen von Bildern und Text im Apotheken-Anzeigen-Editor liefert Ergebnisse, die optisch stark vom Original abweichen. Drei konkrete Ursachen:

- **(a) Bild falsch skaliert:** Hardcodierter Faktor `* 0.6` auf die Box-Höhe ohne sachlichen Grund
- **(b) Text ungenau:** `fitTextInBox` schätzt Zeichenbreiten mit `0.6 * fontSize` statt echte Font-Metriken zu verwenden; alle Textfelder (Name, Beschreibung, Preis) werden in eine einzige Box gequetscht
- **(d) Bounding Boxes falsch:** Claude schätzt Koordinaten aus dem gerenderten Seitenbild — strukturell ungenau

## Lösung: Ansatz D — PDF-native Extraktion + korrektes Rendering

### Kernidee

`pdfjs-dist` (bereits im Projekt) kann Textelemente direkt aus der PDF-Struktur auslesen — mit exakten Koordinaten, Schriftgröße, Bold-Flag und Farbe. Claude wird nur noch für semantische Klassifikation verwendet (welche Elemente gehören zu welchem Produkt), nicht mehr für Koordinatenschätzung.

## Architektur

### Extraktionsphase (behebt d)

1. `extractNativeTextItems()` liest alle Textelemente einer PDF-Seite via `pdfjs` mit exakten Koordinaten
2. Diese strukturierten Daten + das Seitenbild gehen an Claude
3. Claude ordnet Element-IDs Produkten zu (semantisch, kein Pixel-Raten)
4. Für Produktbilder schätzt Claude weiterhin die Position, aber mit bekannten Textankern deutlich präziser
5. Server Action mappt Element-IDs → vollständige `Product`-Objekte mit exakten Koordinaten

### Rendering-Phase (behebt a+b)

- Jedes Textfeld erhält seine eigene `BoundingBox` aus dem Original-PDF
- Textmessung mit `font.widthOfTextAtSize()` statt Schätzung
- Bild füllt die volle Box (`fit: 'contain'` via sharp, kein `* 0.6`)
- Schriftgröße, Bold und Farbe direkt aus PDF-Metadaten

## Datenmodell

### Neu: `TextElement`

```typescript
export interface TextElement {
  text: string
  position: BoundingBox      // exakte Koordinaten aus pdfjs (% der Seite)
  fontSize: number           // in Punkt, exakt aus PDF-Struktur
  fontBold: boolean          // true wenn Fontname "Bold"/"Heavy"/"Black" enthält
  fontItalic: boolean
  textColor: { r: number; g: number; b: number }
}
```

### Erweitertes `Product`

```typescript
export interface Product {
  id: string
  name: string
  description: string
  price: string
  salePrice?: string
  position: BoundingBox         // Fallback / gesamte Produktfläche
  pageNumber: number

  // NEU: separate Elemente mit exakten Koordinaten
  nameElement?: TextElement
  descriptionElement?: TextElement
  priceElement?: TextElement
  salePriceElement?: TextElement
  imagePosition?: BoundingBox   // Claude-Schätzung, durch Textanker präziser

  // Bisherige Felder bleiben als Fallback
  textColor?: { r: number; g: number; b: number }
  fontSize?: number
  fontBold?: boolean
}
```

`ProductEdit` bleibt unverändert.

## Neue Datei: `lib/pdf-extract-native.ts`

```typescript
export interface NativeTextItem {
  id: string           // z.B. "t1", "t2"
  text: string
  x: number            // % von links (0-100)
  y: number            // % von oben (0-100)
  width: number        // % der Seitenbreite
  height: number       // % der Seitenhöhe
  fontSize: number     // in Punkt, exakt
  fontBold: boolean
  fontItalic: boolean
  color: { r: number; g: number; b: number }
}

export async function extractNativeTextItems(
  pdfBytes: ArrayBuffer,
  pageNumber: number
): Promise<NativeTextItem[]>
```

Intern:
- `page.getTextContent()` liefert Items mit `transform`-Matrix `[a, b, c, d, x, y]`
- Schriftgröße = `Math.sqrt(a² + b²)` aus der Matrix
- Position von PDF-Koordinaten (Ursprung unten-links) → % (Ursprung oben-links)
- Fontname aus `styles`-Map → Bold-Erkennung per String-Check (`"Bold"`, `"Heavy"`, `"Black"`)

## Geändertes `actions/extract.ts`

### Neuer Claude-Prompt

Claude bekommt:
- Das Seitenbild (wie bisher)
- Alle Textelemente als JSON-Liste mit IDs, Text, Position, Schriftgröße

Claude gibt zurück:
```json
[{
  "id": "p1",
  "nameElementId": "t1",
  "descriptionElementId": "t3",
  "priceElementId": "t5",
  "salePriceElementId": "t6",
  "imageArea": { "x": 10, "y": 20, "width": 30, "height": 25 }
}]
```

Keine Koordinatenschätzung mehr — nur semantische Zuordnung von Element-IDs.

## Fixes in `lib/pdf-generate.ts`

### Bild-Fix

```typescript
// Vorher (falsch):
page.drawImage(image, { x: rect.x, y: rect.y, width: rect.width, height: rect.height * 0.6 })

// Nachher:
page.drawImage(image, { x: rect.x, y: rect.y, width: rect.width, height: rect.height })
// sharp verwendet fit: 'contain' um Seitenverhältnis zu erhalten
```

### Text-Fix: exakte Messung

```typescript
// Vorher: Schätzung
const approxWidth = text.length * 0.6 * size

// Nachher: exakt
const textWidth = font.widthOfTextAtSize(text, size)
```

### Text-Fix: separate Boxen pro Feld

```typescript
if (product.nameElement)
  drawSingleText(page, edit.name ?? product.name, product.nameElement, helveticaBold)

if (product.descriptionElement)
  drawSingleText(page, edit.description ?? product.description, product.descriptionElement, helvetica)

if (product.priceElement)
  drawSingleText(page, edit.price ?? product.price, product.priceElement, ...)
```

Schriftgröße, Bold und Farbe kommen aus dem jeweiligen `TextElement`.

## Schriftstrategie

- Schriftgröße, Bold, Italic, Farbe werden **exakt** aus dem Original-PDF übernommen
- Font-Familie: Helvetica für Sans-serif (Standard in Apotheken-Flyern), Times für Serif
- Subset-Fonts aus dem Original werden nicht wiederverwendet (Encoding-Probleme)

## Dateien die geändert werden

| Datei | Änderung |
|-------|----------|
| `lib/types.ts` | `TextElement` Interface, `Product` erweitern |
| `lib/pdf-extract-native.ts` | Neue Datei — pdfjs Textextraktion |
| `actions/extract.ts` | Zweiphasige Extraktion, neuer Claude-Prompt |
| `lib/pdf-generate.ts` | Bild-Fix, Text-Metriken, separate Textboxen |
