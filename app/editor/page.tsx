import { Suspense } from 'react'
import { EditorContent } from './EditorContent'
import { Spinner } from '@/components/ui/Spinner'

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner size="lg" /></div>}>
      <EditorContent />
    </Suspense>
  )
}
