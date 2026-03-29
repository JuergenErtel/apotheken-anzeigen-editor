# ApothekenAnzeigen-Editor — Design-Spezifikation

**Datum:** 2026-03-29
**Status:** Genehmigt

---

## Überblick

Web-App für Apotheken-Mitarbeiter: Ein monatlicher Werbeflyer (PDF) wird hochgeladen, alle Produktangebote werden per Claude Vision API extrahiert, der Nutzer kann Produkte (Name, Beschreibung, Preis, Bild) einzeln tauschen, und die App generiert ein neues PDF das exakt das Original-Layout beibehält — nur die Produktinhalte werden ersetzt.

---

## Rahmenbedingungen

- **Deployment:** Vercel (App Router, Server Actions)
- **Nutzer:** Single-User, keine Authentifizierung
- **Persistenz:** Vercel Blob (PDFs + Session-JSON), kein KV / keine Datenbank
- **Sprache UI:** Deutsch
- **Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, pdf-lib, pdfjs-dist, Anthropic Claude API (claude-sonnet-4-6), sharp, react-dropzone, Zustand

---

## Architektur

```
Browser (Next.js App Router)
  └── /                Upload-Seite
  └── /editor          Editor-Seite
  └── /download        Download-Seite

Server Actions
  └── uploadPdf()         → PDF → Vercel Blob → session-{id}.json anlegen
  └── extractProducts()   → PDF-Seiten als base64 → Claude API → Produkt-JSON
  └── saveSession()       → session-{id}.json in Vercel Blob überschreiben
  └── loadSession()       → session-{id}.json aus Vercel Blob laden
  └── generatePdf()       → Original-PDF laden → Ersetzungen anwenden → neues PDF

Vercel Blob
  └── pdf-{uuid}.pdf          Originales PDF (unveränderlich)
  └── session-{uuid}.json     Sitzungsdaten (Produkte, Edits, Ersatzbilder)

Client State (Zustand)
  └── sessionId, originalPdfUrl, pages[], products[], edits{}, activeProductId, isDirty
```

### Sitzungsfluss

1. Nutzer lädt PDF hoch → `pdf-{uuid}.pdf` in Blob, leere `session-{uuid}.json` angelegt
2. Claude extrahiert Produkte → Ergebnis in `session-{uuid}.json` gespeichert
3. Nutzer bearbeitet Produkte → Änderungen in Zustand + debounced auto-save (500 ms)
4. PDF generieren → Original aus Blob laden, Ersetzungen anwenden, download
5. Session-ID im Cookie → Seiten-Reload stellt Sitzung wieder her

---

## Seiten

### `/` — Upload-Seite

- Drag-and-Drop (react-dropzone) oder Klick-Upload für PDF-Dateien
- Nach Upload: alle Seiten als Canvas-Vorschau (pdfjs-dist)
- Fortschrittsanzeige während Claude-Extraktion (pro Seite)
- Bei Fehler: Toast-Meldung + "Erneut versuchen"-Button
- Nach erfolgreicher Extraktion: Weiterleitung zu `/editor?session={id}`

### `/editor?session={id}` — Editor-Seite

**Layout: 60/40-Split (fest)**
- Links (60%): PDF-Canvas-Vorschau
  - Seitennavigation (Vorige / Nächste)
  - Transparentes Overlay-Layer über dem Canvas
  - Farbige Bounding-Box-Rahmen für jedes Produkt
  - Aktives Produkt: 8 Resize-Handles (Ecken + Kanten), Drag-and-Drop zum Verschieben/Skalieren
- Rechts (40%): Produktliste als Karten
  - Editierbare Felder: Name, Beschreibung, Preis, Aktionspreis
  - Bild-Upload (Ersatzbild, optional)
  - Toggle aktiv/inaktiv (inaktiv = Produkt wird nicht ersetzt)
  - Klick auf Karte → hebt Produkt auf Canvas hervor und scrollt zur richtigen Seite
- Auto-Save: jede Änderung → 500 ms debounce → `saveSession()` Server Action
- "PDF generieren"-Button → `generatePdf()` → Weiterleitung zu `/download?session={id}`

### `/download?session={id}` — Download-Seite

- Vorher/Nachher-Vergleich: Original-PDF vs. neues PDF (Canvas nebeneinander, seitenweise)
- "Neue Anzeige herunterladen"-Button
- "Zurück zum Editor"-Button

---

## Server Actions

### `uploadPdf(formData: FormData)`
- Empfängt PDF-Datei
- Lädt in Vercel Blob hoch: `pdf-{uuid}.pdf`
- Rendert alle Seiten via pdfjs-dist als PNG (für Canvas-Vorschau + Claude)
- Legt `session-{uuid}.json` in Blob an (zunächst ohne Produkte)
- Gibt `sessionId` zurück

### `extractProducts(sessionId: string)`
- Lädt PDF-Seiten-PNGs (base64)
- Schickt jede Seite einzeln an Claude API (`claude-sonnet-4-6`)
- Prompt: Apotheken-Flyer-Analyse, gibt strukturiertes JSON-Array zurück
- Speichert extrahierte Produkte in `session-{uuid}.json`
- Gibt `Product[]` zurück

### `saveSession(sessionId: string, data: SessionData)`
- Überschreibt `session-{uuid}.json` in Vercel Blob

### `loadSession(sessionId: string)`
- Lädt und parst `session-{uuid}.json` aus Vercel Blob
- Gibt `SessionData | null` zurück

### `generatePdf(sessionId: string)`
- Lädt Original-PDF (`pdf-{uuid}.pdf`) aus Blob
- Lädt Session-Daten (Produkte + Edits)
- Für jedes aktive Produkt mit Änderungen:
  1. Weißes Rechteck über Bounding Box (Koordinaten-Konvertierung: % → PDF-Punkte, y-Achse invertiert)
  2. Neuen Text mit Helvetica einzeichnen (Schriftgröße auto-angepasst)
  3. Falls Ersatzbild vorhanden: sharp → optimieren → als JPEG einbetten
- Gibt neues PDF als `Uint8Array` zurück (als Response-Stream für Download)

---

## Claude API Integration

**Modell:** `claude-sonnet-4-6`
**Eingabe:** PDF-Seite als base64-PNG
**Prompt:**

```
Du analysierst eine Seite eines Apotheken-Werbeflyers.
Extrahiere ALLE Produktangebote auf dieser Seite.
Gib für jedes Produkt zurück:
{
  "id": "eindeutiger String",
  "name": "Produktname",
  "description": "Untertitel oder Kurzbeschreibung",
  "price": "regulärer Preis als String",
  "salePrice": "Aktions-/Sonderpreis falls vorhanden",
  "position": {
    "x": Prozent von links (0-100),
    "y": Prozent von oben (0-100),
    "width": Prozent der Seitenbreite (0-100),
    "height": Prozent der Seitenhöhe (0-100)
  },
  "pageNumber": Seitennummer
}
Antworte NUR mit einem JSON-Array, kein weiterer Text.
```

---

## Datenmodelle

```typescript
interface Product {
  id: string
  name: string
  description: string
  price: string
  salePrice?: string
  position: BoundingBox
  pageNumber: number
}

interface BoundingBox {
  x: number      // % von links
  y: number      // % von oben
  width: number  // % der Seitenbreite
  height: number // % der Seitenhöhe
}

interface ProductEdit {
  name?: string
  description?: string
  price?: string
  salePrice?: string
  position?: BoundingBox
  replacementImage?: string  // base64 JPEG
  active: boolean
}

interface SessionData {
  sessionId: string
  pdfBlobUrl: string
  pageCount: number
  products: Product[]
  edits: Record<string, ProductEdit>
  createdAt: string
}
```

---

## PDF-Ersetzungslogik

1. **Koordinaten-Konvertierung** (% → PDF-Punkte, y-Achse invertiert):
   ```
   pdfX = (box.x / 100) * pageWidth
   pdfY = pageHeight - ((box.y + box.height) / 100) * pageHeight
   pdfW = (box.width / 100) * pageWidth
   pdfH = (box.height / 100) * pageHeight
   ```
2. Weißes Rechteck: `page.drawRectangle({ x: pdfX, y: pdfY, width: pdfW, height: pdfH, color: rgb(1,1,1) })`
3. Text einzeichnen mit `StandardFonts.Helvetica`, Schriftgröße automatisch verkleinern bis Text passt
4. Bild einbetten: `sharp` → JPEG → `pdfDoc.embedJpg()` → `page.drawImage()`
5. Alles außerhalb der Bounding Boxes bleibt unverändert

**Einschränkung:** Original-Schriften aus dem PDF können nicht ausgelesen werden → immer Helvetica als Fallback.

---

## Drag-and-Drop Bounding Box

- Canvas rendert PDF-Seite als PNG (pdfjs-dist)
- Transparentes `<div>` overlay über dem Canvas (`position: absolute, inset: 0`)
- Pro Produkt: farbiger `<div>`-Rahmen (absolute positioniert, % → px)
- Aktives Produkt: 8 Resize-Handles (Ecken + Kanten) via reines CSS + Mouse-Events
- `mousedown` → `mousemove` → `mouseup` Handler berechnen neue % Werte
- Neue Position sofort in Zustand-Store + auto-save

---

## Fehlerbehandlung

| Fehler | Verhalten |
|--------|-----------|
| Upload fehlgeschlagen | Toast-Fehlermeldung, Upload-Zustand zurücksetzen |
| Claude-Extraktion fehlgeschlagen | Fehlermeldung + "Erneut versuchen"-Button |
| Keine Produkte gefunden | Hinweis anzeigen, Nutzer kann zur Upload-Seite zurück |
| Session nicht gefunden / abgelaufen | Weiterleitung zu `/` mit Hinweis |
| PDF-Generierung fehlgeschlagen | Toast-Fehler, Editor bleibt geöffnet |
| Vercel Blob Fehler | Generische Fehlermeldung + Retry-Option |

---

## Umgebungsvariablen

```
ANTHROPIC_API_KEY=...
BLOB_READ_WRITE_TOKEN=...
```

---

## Visuelles Design

- Blau/Weiß Farbschema (pharmazeutisch/medizinisch)
- Tailwind CSS
- Responsive Layout
- Toast-Benachrichtigungen für Fehler und Erfolgsmeldungen
- Loading-Spinner mit Fortschrittsanzeige bei Claude-Extraktion
- Karten-basierte UI für Produktliste
