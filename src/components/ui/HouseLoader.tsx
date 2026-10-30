'use client'

/**
 * A small CSS-only "moving day" scene used while listings load.
 * Kept dependency-free so it costs nothing beyond the SVG markup.
 */
export default function HouseLoader({ label = 'Finding homes for you…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      <svg
        viewBox="0 0 260 130"
        className="h-28 w-56 sm:h-32 sm:w-64"
        aria-hidden="true"
        fill="none"
      >
        {/* ground */}
        <ellipse cx="130" cy="116" rx="110" ry="7" className="fill-emerald-500/10" />

        {/* clouds */}
        <g className="loader-cloud" style={{ animationDelay: '0s' }}>
          <ellipse cx="44" cy="26" rx="16" ry="7" className="fill-slate-300/70 dark:fill-slate-600/60" />
          <ellipse cx="56" cy="22" rx="10" ry="6" className="fill-slate-300/70 dark:fill-slate-600/60" />
        </g>
        <g className="loader-cloud" style={{ animationDelay: '1.4s' }}>
          <ellipse cx="196" cy="34" rx="13" ry="6" className="fill-slate-300/60 dark:fill-slate-600/50" />
          <ellipse cx="206" cy="30" rx="8" ry="5" className="fill-slate-300/60 dark:fill-slate-600/50" />
        </g>

        {/* house */}
        <g>
          <path d="M150 106V66l34-24 34 24v40z" className="fill-white stroke-emerald-500/70 dark:fill-slate-800" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M144 70l40-29 40 29" className="stroke-emerald-500" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="174" y="80" width="20" height="26" rx="2.5" className="fill-emerald-500/80 loader-door" />
          <circle cx="190" cy="93" r="1.4" className="fill-white" />
          <rect x="158" y="76" width="10" height="10" rx="2" className="fill-sky-300/80 dark:fill-sky-500/50" />
          <rect x="202" y="76" width="10" height="10" rx="2" className="fill-sky-300/80 dark:fill-sky-500/50" />
          <rect x="215" y="52" width="7" height="14" rx="2" className="fill-emerald-600/70" />
        </g>

        {/* character carrying a box */}
        <g className="loader-walk">
          <circle cx="78" cy="62" r="8" className="fill-amber-300 dark:fill-amber-400" />
          <path d="M70 57c1-6 5-9 8-9s7 3 8 9" className="stroke-slate-800 dark:stroke-slate-200" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="70" y="70" width="16" height="22" rx="6" className="fill-emerald-500" />
          <path d="M72 92l-3 16" className="loader-leg-a stroke-slate-700 dark:stroke-slate-300" strokeWidth="4" strokeLinecap="round" />
          <path d="M84 92l3 16" className="loader-leg-b stroke-slate-700 dark:stroke-slate-300" strokeWidth="4" strokeLinecap="round" />
          <path d="M70 76l-10 6" className="stroke-amber-300 dark:stroke-amber-400" strokeWidth="4" strokeLinecap="round" />
          {/* box */}
          <g className="loader-box">
            <rect x="92" y="66" width="22" height="18" rx="2.5" className="fill-amber-500" />
            <path d="M92 73h22M103 66v18" className="stroke-amber-700/70" strokeWidth="1.5" />
            <path d="M103 66c-3 0-5-2-5-4h10c0 2-2 4-5 4z" className="fill-amber-300" />
          </g>
        </g>

        {/* little dust puffs */}
        <g className="loader-dust">
          <circle cx="58" cy="110" r="3" className="fill-slate-300 dark:fill-slate-600" />
          <circle cx="48" cy="107" r="2" className="fill-slate-300/70 dark:fill-slate-600/70" />
        </g>
      </svg>

      <div className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
        <span>{label}</span>
        <span className="loader-dots" aria-hidden="true">
          <i /><i /><i />
        </span>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500">Checking availability and prices…</p>
    </div>
  )
}
