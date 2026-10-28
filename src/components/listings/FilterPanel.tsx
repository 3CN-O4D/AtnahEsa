'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { X, SlidersHorizontal, CheckCheck } from 'lucide-react'
import { ISSUE_FILTERS } from '@/lib/constants'

interface FilterPanelProps {
  onApply: (filters: Record<string, string>) => void
}

export default function FilterPanel({ onApply }: FilterPanelProps) {
  const [location, setLocation] = useState('')
  const [minRent, setMinRent] = useState('')
  const [maxRent, setMaxRent] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [issues, setIssues] = useState('')
  const [isExpanded, setIsExpanded] = useState(true)

  const hasFilters = location || minRent || maxRent || minPrice || maxPrice || issues

  const handleApply = () => {
    onApply({
      ...(location && { location }),
      ...(minRent && { minRent }),
      ...(maxRent && { maxRent }),
      ...(minPrice && { minPrice }),
      ...(maxPrice && { maxPrice }),
      ...(issues && { issues }),
    })
  }

  const handleReset = () => {
    setLocation('')
    setMinRent('')
    setMaxRent('')
    setMinPrice('')
    setMaxPrice('')
    setIssues('')
    onApply({})
  }

  return (
    <div className="bg-white dark:bg-slate-900 border dark:border-gray-700 rounded-xl overflow-hidden animate-slideDown">
      <div className="p-4 space-y-4 animate-fadeInUp">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-600" />
            Filters
          </h3>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="tap-scale text-red-600 hover:text-red-700"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>

        <Input
          label="Location"
          id="filter-location"
          placeholder="e.g. Nairobi, Mombasa"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3 animate-slideInRight" style={{ animationDelay: '50ms' }}>
          <Input
            label="Min Rent"
            id="filter-min-rent"
            type="number"
            placeholder="0"
            value={minRent}
            onChange={(e) => setMinRent(e.target.value)}
          />
          <Input
            label="Max Rent"
            id="filter-max-rent"
            type="number"
            placeholder="Any"
            value={maxRent}
            onChange={(e) => setMaxRent(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 animate-slideInRight" style={{ animationDelay: '100ms' }}>
          <Input
            label="Min Charge"
            id="filter-min-price"
            type="number"
            placeholder="300"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
          <Input
            label="Max Charge"
            id="filter-max-price"
            type="number"
            placeholder="Any"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>

        <div className="space-y-2 animate-fadeInUp" style={{ animationDelay: '150ms' }}>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Issues</label>
          <div className="flex flex-wrap gap-2">
            {ISSUE_FILTERS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setIssues(issues === opt.value ? '' : opt.value)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-all duration-200 tap-scale ${
                  issues === opt.value
                    ? 'bg-blue-600 text-white border-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.3)]'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800'
                }`}
              >
                {issues === opt.value && <CheckCheck className="w-3 h-3 mr-1.5" />}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2 animate-slideUp" style={{ animationDelay: '200ms' }}>
          <Button onClick={handleApply} size="sm" className="flex-1 tap-scale" disabled={!hasFilters}>
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Apply Filters
          </Button>
          <Button onClick={handleReset} size="sm" variant="ghost" className="tap-scale" disabled={!hasFilters}>
            <X className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
