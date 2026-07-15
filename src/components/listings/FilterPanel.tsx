'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
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
    <div className="bg-white border rounded-xl p-4 space-y-4">
      <Input
        label="Location"
        id="filter-location"
        placeholder="e.g. Nairobi, Mombasa"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
      />

      <div className="grid grid-cols-2 gap-3">
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

      <div className="grid grid-cols-2 gap-3">
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

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">Issues</label>
        <div className="flex flex-wrap gap-2">
          {ISSUE_FILTERS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setIssues(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                issues === opt.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={handleApply} size="sm" className="flex-1">
          Apply Filters
        </Button>
        <Button onClick={handleReset} size="sm" variant="ghost">
          Reset
        </Button>
      </div>
    </div>
  )
}
