'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body className="min-h-screen flex items-center justify-center px-4 bg-white">
        <div className="text-center max-w-md">
          <h1 className="text-6xl font-bold text-gray-200 mb-4">500</h1>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Something went wrong</h2>
          <p className="text-gray-500 text-sm mb-6">
            A critical error occurred. Please refresh the page.
          </p>
          <button
            onClick={() => reset()}
            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  )
}
