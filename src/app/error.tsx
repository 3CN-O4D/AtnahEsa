'use client'

import { useEffect } from 'react'
import Button from '@/components/ui/Button'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-gray-200 mb-4">500</h1>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Something went wrong</h2>
        <p className="text-gray-500 text-sm mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <Button onClick={reset} className="!px-5">
          Try Again
        </Button>
      </div>
    </div>
  )
}
