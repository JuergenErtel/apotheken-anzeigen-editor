'use client'

import { useRef } from 'react'
import type { Product, ProductEdit } from '@/lib/types'

interface ProductCardProps {
  product: Product
  edit: ProductEdit
  isActive: boolean
  onChange: (edit: Partial<ProductEdit>) => void
  onSelect: () => void
}

export function ProductCard({ product, edit, isActive, onChange, onSelect }: ProductCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onChange({ replacementImage: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
        isActive
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : edit.active
          ? 'border-gray-200 bg-white hover:border-blue-300'
          : 'border-gray-100 bg-gray-50 opacity-50'
      }`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">
          Seite {product.pageNumber}
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={edit.active}
            onChange={(e) => onChange({ active: e.target.checked })}
            onClick={(e) => e.stopPropagation()}
            className="accent-blue-600"
          />
          Ersetzen
        </label>
      </div>

      {/* Felder */}
      <div className="space-y-2">
        <input
          type="text"
          value={edit.name ?? product.name}
          onChange={(e) => onChange({ name: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Produktname"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          value={edit.description ?? product.description}
          onChange={(e) => onChange({ description: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          placeholder="Beschreibung"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={edit.price ?? product.price}
            onChange={(e) => onChange({ price: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Preis"
            className="w-1/2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <input
            type="text"
            value={edit.salePrice ?? product.salePrice ?? ''}
            onChange={(e) => onChange({ salePrice: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Aktionspreis"
            className="w-1/2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Bild-Upload */}
      <div className="mt-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          {edit.replacementImage ? '✓ Bild hochgeladen' : '+ Ersatzbild hochladen'}
        </button>
      </div>
    </div>
  )
}
