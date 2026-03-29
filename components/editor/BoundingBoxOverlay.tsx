'use client'

import { useRef, useCallback } from 'react'
import type { BoundingBox, Product } from '@/lib/types'

interface BoundingBoxOverlayProps {
  products: Product[]
  edits: Record<string, { position?: BoundingBox; active: boolean }>
  activeProductId: string | null
  containerWidth: number
  containerHeight: number
  onProductClick: (id: string) => void
  onPositionChange: (productId: string, newPosition: BoundingBox) => void
}

const HANDLE_POSITIONS = [
  'nw', 'n', 'ne',
  'w',        'e',
  'sw', 's', 'se',
] as const

type HandlePosition = typeof HANDLE_POSITIONS[number]

function getHandleStyle(pos: HandlePosition): React.CSSProperties {
  const isNorth = pos.includes('n')
  const isSouth = pos.includes('s')
  const isWest = pos.includes('w')
  const isEast = pos.includes('e')
  return {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#2563eb',
    border: '1px solid white',
    borderRadius: 2,
    top: isNorth ? -5 : isSouth ? undefined : '50%',
    bottom: isSouth ? -5 : undefined,
    left: isWest ? -5 : isEast ? undefined : '50%',
    right: isEast ? -5 : undefined,
    transform:
      pos === 'n' || pos === 's' ? 'translateX(-50%)'
      : pos === 'w' || pos === 'e' ? 'translateY(-50%)'
      : undefined,
    cursor: `${pos}-resize`,
    zIndex: 10,
  }
}

export function BoundingBoxOverlay({
  products,
  edits,
  activeProductId,
  containerWidth,
  containerHeight,
  onProductClick,
  onPositionChange,
}: BoundingBoxOverlayProps) {
  const dragState = useRef<{
    productId: string
    handle: HandlePosition | 'move'
    startX: number
    startY: number
    startBox: BoundingBox
  } | null>(null)

  const toPercent = useCallback(
    (px: number, axis: 'x' | 'y') =>
      (px / (axis === 'x' ? containerWidth : containerHeight)) * 100,
    [containerWidth, containerHeight]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, productId: string, handle: HandlePosition | 'move') => {
      e.preventDefault()
      e.stopPropagation()
      const edit = edits[productId]
      const product = products.find((p) => p.id === productId)
      const box = edit?.position ?? product?.position
      if (!box) return
      dragState.current = {
        productId,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        startBox: { ...box },
      }
      onProductClick(productId)
    },
    [edits, products, onProductClick]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragState.current) return
      const { productId, handle, startX, startY, startBox } = dragState.current
      const dx = toPercent(e.clientX - startX, 'x')
      const dy = toPercent(e.clientY - startY, 'y')

      let newBox = { ...startBox }

      if (handle === 'move') {
        newBox.x = Math.max(0, Math.min(100 - startBox.width, startBox.x + dx))
        newBox.y = Math.max(0, Math.min(100 - startBox.height, startBox.y + dy))
      } else {
        if (handle.includes('e')) {
          newBox.width = Math.max(5, startBox.width + dx)
        }
        if (handle.includes('s')) {
          newBox.height = Math.max(5, startBox.height + dy)
        }
        if (handle.includes('w')) {
          newBox.x = startBox.x + dx
          newBox.width = Math.max(5, startBox.width - dx)
        }
        if (handle.includes('n')) {
          newBox.y = startBox.y + dy
          newBox.height = Math.max(5, startBox.height - dy)
        }
      }

      onPositionChange(productId, newBox)
    },
    [toPercent, onPositionChange]
  )

  const handleMouseUp = useCallback(() => {
    dragState.current = null
  }, [])

  return (
    <div
      className="absolute inset-0"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {products.map((product) => {
        const edit = edits[product.id]
        if (!edit?.active) return null
        const box = edit.position ?? product.position
        const isActive = product.id === activeProductId

        return (
          <div
            key={product.id}
            style={{
              position: 'absolute',
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
              border: `2px solid ${isActive ? '#2563eb' : '#93c5fd'}`,
              background: isActive ? 'rgba(37,99,235,0.08)' : 'rgba(147,197,253,0.05)',
              cursor: 'move',
              boxSizing: 'border-box',
            }}
            onMouseDown={(e) => handleMouseDown(e, product.id, 'move')}
          >
            {/* Produkt-Label */}
            <div
              className="absolute -top-5 left-0 max-w-full truncate rounded-t bg-blue-600 px-1 text-xs text-white"
              style={{ fontSize: 10, whiteSpace: 'nowrap' }}
            >
              {product.name}
            </div>

            {/* Resize Handles — nur für aktives Produkt */}
            {isActive &&
              HANDLE_POSITIONS.map((pos) => (
                <div
                  key={pos}
                  style={getHandleStyle(pos)}
                  onMouseDown={(e) => handleMouseDown(e, product.id, pos)}
                />
              ))}
          </div>
        )
      })}
    </div>
  )
}
