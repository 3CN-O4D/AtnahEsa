'use client'

import { Check, X } from 'lucide-react'
import Modal from '@/components/ui/Modal'

export interface ReasonOption {
  id: string
  label: string
  description?: string
  badge?: string
}

interface ReasonModalProps {
  open: boolean
  title: string
  subtitle?: string
  options: ReasonOption[]
  selected: string[]
  freeText: string
  freeTextPlaceholder?: string
  onToggle: (id: string) => void
  onFreeTextChange: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  submitLabel?: string
  submitting?: boolean
}

/**
 * Quick, optional feedback: tap as many common reasons as apply, then add a
 * short note only if you want to. Nothing here is compulsory.
 */
export default function ReasonModal({
  open,
  title,
  subtitle,
  options,
  selected,
  freeText,
  freeTextPlaceholder = 'Anything else? Optional.',
  onToggle,
  onFreeTextChange,
  onClose,
  onSubmit,
  submitLabel = 'Submit',
  submitting = false,
}: ReasonModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {subtitle ? <p className="-mt-1 mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{subtitle}</p> : null}

      <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
        Pick the reasons that match <span className="font-normal text-gray-400">(optional, you can choose more than one)</span>
      </p>
      <div className="grid max-h-[42vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
        {options.map((option) => {
          const active = selected.includes(option.id)
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              aria-pressed={active}
              className={`flex items-start gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                active
                  ? 'border-blue-500 bg-blue-50 dark:border-blue-500 dark:bg-blue-950/30'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
            >
              <span
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                  active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 dark:border-gray-600'
                }`}
              >
                {active ? <Check className="h-3 w-3" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-gray-800 dark:text-gray-100">
                  {option.label}
                  {option.badge ? (
                    <span className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">· {option.badge}</span>
                  ) : null}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-gray-500 dark:text-gray-400">{option.description}</span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

      <label className="mt-4 block">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Add a note <span className="font-normal text-gray-400">(optional)</span></span>
        <textarea
          value={freeText}
          onChange={(e) => onFreeTextChange(e.target.value)}
          rows={3}
          placeholder={freeTextPlaceholder}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-slate-800"
        />
      </label>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {submitting ? 'Sending…' : submitLabel}
        </button>
      </div>
    </Modal>
  )
}
