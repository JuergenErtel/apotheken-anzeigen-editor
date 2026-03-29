'use client'

import { useEffect, useState } from 'react'
import { renderPdfPages } from '@/lib/pdf-client'
import { Spinner } from '@/components/ui/Spinner'
import type { PageImage } from '@/lib/types'

interface PdfComparisonProps {
  originalUrl: string
  generatedUrl: string
}

export function PdfComparison({ originalUrl, generatedUrl }: PdfComparisonProps) {
  const [originalPages, setOriginalPages] = useState<PageImage[]>([])
  const [generatedPages, setGeneratedPages] = useState<PageImage[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [origResp, genResp] = await Promise.all([
        fetch(originalUrl),
        fetch(generatedUrl),
      ])
      const [origBuf, genBuf] = await Promise.all([
        origResp.arrayBuffer(),
        genResp.arrayBuffer(),
      ])
      const [orig, gen] = await Promise.all([
        renderPdfPages(origBuf),
        renderPdfPages(genBuf),
      ])
      setOriginalPages(orig)
      setGeneratedPages(gen)
      setLoading(false)
    }
    load()
  }, [originalUrl, generatedUrl])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-3 text-gray-500">
        <Spinner /> <span>PDFs werden gerendert…</span>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {originalPages.map((orig, i) => {
        const gen = generatedPages[i]
        return (
          <div key={orig.pageNumber}>
            <div className="mb-2 text-sm font-medium text-gray-500">Seite {orig.pageNumber}</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Original</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={orig.dataUrl} alt={`Original Seite ${orig.pageNumber}`} className="w-full rounded shadow" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-blue-500 uppercase tracking-wide">Neu</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gen?.dataUrl} alt={`Neu Seite ${orig.pageNumber}`} className="w-full rounded shadow ring-2 ring-blue-400" />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
