'use client'

import { useState, useRef } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface SearchBarProps {
  onSearch: (query: string) => void
  onToggleFilters: () => void
}

export default function SearchBar({ onSearch, onToggleFilters }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(query)
    if (inputRef.current) {
      inputRef.current.blur()
    }
  }

  const clearQuery = () => {
    setQuery('')
    onSearch('')
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-colors duration-200 group-focus-within:text-blue-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by location, title..."
          className="w-full pl-10 pr-12 h-10 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 hover:border-gray-400 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
        />
        {query && (
          <button
            type="button"
            onClick={clearQuery}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200 tap-scale"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <Button type="submit" size="sm" className="tap-scale">
        Search
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={onToggleFilters} className="tap-scale">
        <SlidersHorizontal className="w-4 h-4 transition-transform duration-200 hover:rotate-45" />
      </Button>
    </form>
  )
}
