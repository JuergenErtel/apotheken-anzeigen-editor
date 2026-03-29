import { Suspense } from 'react'
import { UploadContent } from './UploadContent'
import { Spinner } from '@/components/ui/Spinner'

export const maxDuration = 60

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner size="lg" /></div>}>
      <UploadContent />
    </Suspense>
  )
}
