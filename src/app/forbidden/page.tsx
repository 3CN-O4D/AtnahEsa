import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold text-gray-200 mb-4">403</h1>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Access denied</h2>
        <p className="text-gray-500 text-sm mb-6">
          You don&apos;t have permission to view this page.
        </p>
        <Link href="/" className="inline-block px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          Back to Home
        </Link>
      </div>
    </div>
  )
}
