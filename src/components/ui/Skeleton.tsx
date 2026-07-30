export function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="aspect-[4/3] animate-shimmer" />
      <div className="p-3 space-y-3">
        <div className="h-4 w-3/4 rounded animate-shimmer" />
        <div className="h-3 w-1/2 rounded animate-shimmer" />
        <div className="flex justify-between">
          <div className="h-3 w-1/3 rounded animate-shimmer" />
          <div className="h-3 w-1/5 rounded animate-shimmer" />
        </div>
        <div className="h-3 w-1/4 rounded animate-shimmer" />
      </div>
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="h-4 w-16 rounded animate-shimmer" />
      <div className="aspect-video rounded-xl animate-shimmer" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-2">
            <div className="h-8 w-3/4 rounded animate-shimmer" />
            <div className="h-4 w-1/2 rounded animate-shimmer" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl animate-shimmer" />)}
          </div>
          <div className="h-32 rounded-xl animate-shimmer" />
          <div className="h-48 rounded-xl animate-shimmer" />
          <div className="h-64 rounded-xl animate-shimmer" />
        </div>
        <div className="space-y-4">
          <div className="h-64 rounded-xl animate-shimmer" />
        </div>
      </div>
    </div>
  )
}
