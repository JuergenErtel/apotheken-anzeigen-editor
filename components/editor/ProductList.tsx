'use client'

import { ProductCard } from './ProductCard'
import type { Product, ProductEdit } from '@/lib/types'

interface ProductListProps {
  products: Product[]
  edits: Record<string, ProductEdit>
  activeProductId: string | null
  onEditChange: (productId: string, edit: Partial<ProductEdit>) => void
  onProductSelect: (productId: string) => void
}

export function ProductList({
  products,
  edits,
  activeProductId,
  onEditChange,
  onProductSelect,
}: ProductListProps) {
  if (products.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-400">
        Keine Produkte gefunden
      </div>
    )
  }

  return (
    <div className="space-y-3 overflow-y-auto pr-1">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          edit={edits[product.id] ?? { active: true }}
          isActive={product.id === activeProductId}
          onChange={(edit) => onEditChange(product.id, edit)}
          onSelect={() => onProductSelect(product.id)}
        />
      ))}
    </div>
  )
}
