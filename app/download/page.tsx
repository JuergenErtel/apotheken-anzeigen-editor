import { Suspense } from 'react'
import { DownloadContent } from './DownloadContent'
import { Spinner } from '@/components/ui/Spinner'

export default function DownloadPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner size="lg" /></div>}>
      <DownloadContent />
    </Suspense>
  )
}
