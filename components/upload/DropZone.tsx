'use client'

import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'

interface DropZoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export function DropZone({ onFile, disabled = false }: DropZoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) onFile(accepted[0])
    },
    [onFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled,
  })

  return (
    <div
      {...getRootProps()}
      role="button"
      aria-disabled={disabled}
      className={`flex h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors ${
        isDragActive
          ? 'border-blue-500 bg-blue-50'
          : disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
          : 'border-blue-300 bg-white hover:border-blue-500 hover:bg-blue-50'
      }`}
    >
      <input {...getInputProps()} />
      <div className="text-4xl mb-3">📄</div>
      <p className="text-lg font-medium text-blue-700">
        PDF-Datei hier ablegen
      </p>
      <p className="mt-1 text-sm text-gray-500">
        oder klicken zum Auswählen
      </p>
    </div>
  )
}
