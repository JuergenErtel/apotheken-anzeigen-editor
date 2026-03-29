export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }[size]
  return (
    <div
      className={`${sizeClass} animate-spin rounded-full border-2 border-blue-200 border-t-blue-600`}
      role="status"
      aria-label="Laden..."
    />
  )
}
