export function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 animate-fadeIn">
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
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 animate-fadeIn">
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

export function SkeletonProfile() {
  return (
    <div className="max-w-md mx-auto px-4 py-10 space-y-6 animate-fadeIn">
      <div className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-full animate-shimmer" />
        <div className="h-6 w-32 rounded animate-shimmer" />
        <div className="h-4 w-48 rounded animate-shimmer" />
      </div>
      <div className="space-y-4">
        {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-xl animate-shimmer" />)}
      </div>
      <div className="h-24 rounded-xl animate-shimmer" />
    </div>
  )
}

export function SkeletonList() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fadeIn">
      {[1,2,3,4,5,6,7,8].map(i => <SkeletonCard key={i} />)}
    </div>
  )
}

export function SkeletonPage({ className = '' }: { className?: string }) {
  return (
    <div className={`max-w-4xl mx-auto px-4 py-10 space-y-4 animate-fadeIn ${className}`}>
      <div className="h-8 w-48 rounded animate-shimmer" />
      <div className="h-4 w-72 rounded animate-shimmer" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 rounded-xl animate-shimmer" />)}
      </div>
    </div>
  )
}

export function SkeletonLister() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6 animate-fadeIn">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full animate-shimmer" />
        <div className="space-y-2">
          <div className="h-6 w-32 rounded animate-shimmer" />
          <div className="h-4 w-48 rounded animate-shimmer" />
        </div>
      </div>
      <div className="h-4 w-64 rounded animate-shimmer" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1,2,3,4,5,6].map(i => <div key={i} className="h-40 rounded-xl animate-shimmer" />)}
      </div>
    </div>
  )
}

export function SkeletonBooking() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-4 animate-fadeIn">
      <div className="h-8 w-40 rounded animate-shimmer" />
      <div className="grid grid-cols-1 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-32 rounded-xl animate-shimmer" />
        ))}
      </div>
    </div>
  )
}
