import { act, renderHook } from '@testing-library/react'
import { useAppStore } from '@/lib/store'

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.getState().reset()
  })

  it('hat initialen Zustand', () => {
    const { result } = renderHook(() => useAppStore())
    expect(result.current.sessionId).toBeNull()
    expect(result.current.products).toEqual([])
    expect(result.current.edits).toEqual({})
    expect(result.current.activeProductId).toBeNull()
  })

  it('setzt Session korrekt', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setSession('session-123', 'https://blob.example.com/pdf.pdf')
    })
    expect(result.current.sessionId).toBe('session-123')
    expect(result.current.originalPdfUrl).toBe('https://blob.example.com/pdf.pdf')
  })

  it('aktualisiert ein Produkt-Edit', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.updateEdit('prod-1', { name: 'Neues Produkt', active: true })
    })
    expect(result.current.edits['prod-1'].name).toBe('Neues Produkt')
    expect(result.current.edits['prod-1'].active).toBe(true)
  })

  it('merged Edit statt zu überschreiben', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.updateEdit('prod-1', { name: 'Name', active: true })
      result.current.updateEdit('prod-1', { price: '3,99 €' })
    })
    expect(result.current.edits['prod-1'].name).toBe('Name')
    expect(result.current.edits['prod-1'].price).toBe('3,99 €')
  })

  it('reset() löscht allen Zustand', () => {
    const { result } = renderHook(() => useAppStore())
    act(() => {
      result.current.setSession('s', 'url')
      result.current.updateEdit('p', { active: true })
      result.current.reset()
    })
    expect(result.current.sessionId).toBeNull()
    expect(result.current.edits).toEqual({})
  })
})
