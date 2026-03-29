import { render, screen } from '@testing-library/react'
import { DropZone } from '@/components/upload/DropZone'

jest.mock('react-dropzone', () => ({
  useDropzone: () => ({
    getRootProps: () => ({ onClick: jest.fn() }),
    getInputProps: () => ({}),
    isDragActive: false,
  }),
}))

describe('DropZone', () => {
  it('zeigt Upload-Aufforderung an', () => {
    render(<DropZone onFile={jest.fn()} />)
    expect(screen.getByText(/PDF-Datei/i)).toBeInTheDocument()
  })

  it('ist deaktiviert während Upload läuft', () => {
    render(<DropZone onFile={jest.fn()} disabled />)
    const zone = screen.getByRole('button')
    expect(zone).toHaveAttribute('aria-disabled', 'true')
  })
})
