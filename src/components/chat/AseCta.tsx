'use client'

/**
 * Inline "Check out with Ase" button. Fires the global `ase:open` event that
 * the floating <ChatWidget /> listens for, so any page can invite visitors
 * into the AI concierge without its own chat state.
 */
const VARIANTS = {
  solid:
    'bg-[#30B54A] text-white shadow-lg shadow-[#30B54A]/25 hover:bg-[#2a9c40] hover:shadow-xl',
  outline:
    'border border-[#30B54A]/40 bg-white/80 text-[#1f7a35] shadow-sm backdrop-blur hover:border-[#30B54A]/70 hover:text-[#2a9c40] dark:border-[#30B54A]/40 dark:bg-slate-900/70 dark:text-[#6fdc84] dark:hover:text-[#8ee8a0]',
  onDark:
    'border border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20',
} as const

export type AseCtaVariant = keyof typeof VARIANTS

function AseFace() {
  return (
    <span className="ase-mascot ase-mascot--sm" aria-hidden="true">
      <span className="ase-antenna" />
      <span className="ase-visor">
        <span className="ase-eye ase-eye-l" />
        <span className="ase-eye ase-eye-r" />
      </span>
      <span className="ase-smile" />
    </span>
  )
}

export default function AseCta({
  label = 'Check out with Ase',
  variant = 'solid',
  className = '',
}: {
  label?: string
  variant?: AseCtaVariant
  className?: string
}) {
  const openChat = () => {
    window.dispatchEvent(new CustomEvent('ase:open'))
  }

  return (
    <button
      type="button"
      onClick={openChat}
      aria-label={label}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5 active:scale-95 ${VARIANTS[variant]} ${className}`}
    >
      <AseFace />
      {label}
    </button>
  )
}
