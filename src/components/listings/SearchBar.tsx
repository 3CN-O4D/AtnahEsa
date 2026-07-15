'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface SearchBarProps {
  onSearch: (query: string) => void
  onToggleFilters: () => void
}

export default function SearchBar({ onSearch, onToggleFilters }: SearchBarProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by location, title..."
          className="w-full pl-10 pr-4 h-10 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <Button type="submit" size="sm">
        Search
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onToggleFilters}>
        <SlidersHorizontal className="w-4 h-4" />
      </Button>
    </form>
  )
}
