import { render, screen, fireEvent } from '@testing-library/react'
import { ProductCard } from '@/components/editor/ProductCard'
import type { Product, ProductEdit } from '@/lib/types'

const product: Product = {
  id: 'p1',
  name: 'Aspirin 500mg',
  description: 'Schmerzmittel',
  price: '3,99 €',
  position: { x: 10, y: 10, width: 30, height: 20 },
  pageNumber: 1,
}

const edit: ProductEdit = { active: true }

describe('ProductCard', () => {
  it('zeigt Produktname an', () => {
    render(<ProductCard product={product} edit={edit} isActive={false} onChange={jest.fn()} onSelect={jest.fn()} />)
    expect(screen.getByDisplayValue('Aspirin 500mg')).toBeInTheDocument()
  })

  it('ruft onChange beim Bearbeiten auf', () => {
    const onChange = jest.fn()
    render(<ProductCard product={product} edit={edit} isActive={false} onChange={onChange} onSelect={jest.fn()} />)
    const input = screen.getByDisplayValue('Aspirin 500mg')
    fireEvent.change(input, { target: { value: 'Aspirin Plus' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Aspirin Plus' }))
  })

  it('zeigt Toggle aktiv/inaktiv', () => {
    const onChange = jest.fn()
    render(<ProductCard product={product} edit={edit} isActive={false} onChange={onChange} onSelect={jest.fn()} />)
    const toggle = screen.getByRole('checkbox')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ active: false }))
  })
})
