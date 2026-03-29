import { Suspense } from 'react'

export const maxDuration = 60
import { EditorContent } from './EditorContent'
import { Spinner } from '@/components/ui/Spinner'

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner size="lg" /></div>}>
      <EditorContent />
    </Suspense>
  )
}
