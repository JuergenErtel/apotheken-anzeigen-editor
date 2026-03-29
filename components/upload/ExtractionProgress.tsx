interface ExtractionProgressProps {
  currentPage: number
  totalPages: number
}

export function ExtractionProgress({ currentPage, totalPages }: ExtractionProgressProps) {
  const percent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0

  return (
    <div className="w-full">
      <div className="mb-2 flex justify-between text-sm text-gray-600">
        <span>Produkte werden extrahiert…</span>
        <span>
          Seite {currentPage} von {totalPages}
        </span>
      </div>
      <div className="h-3 w-full rounded-full bg-blue-100">
        <div
          className="h-3 rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
