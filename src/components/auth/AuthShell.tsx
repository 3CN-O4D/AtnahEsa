import type { ReactNode } from 'react'
import SeasonalDrop from '@/components/seasonal/SeasonalDrop'

/**
 * Shared frame for sign-in / sign-up. The animated top line and soft orbs keep
 * the auth pages feeling like part of the site instead of a plain form.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-md px-4 py-10 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-16 top-6 h-44 w-44 rounded-full bg-emerald-300/30 blur-3xl animate-float dark:bg-emerald-500/10" />
        <div className="absolute -right-20 bottom-2 h-52 w-52 rounded-full bg-blue-400/25 blur-3xl animate-float [animation-delay:1.8s] dark:bg-blue-500/10" />
      </div>

      <SeasonalDrop className="absolute left-full top-0 ml-10 hidden w-[120px] xl:block" thread={72} />

      <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur-xl sm:p-8 dark:border-slate-700/70 dark:bg-slate-900/80">
        <div
          aria-hidden
          className="animate-sheen absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#30B54A,#22d3ee,#2563EB,#30B54A)] bg-[length:200%_100%]"
          style={{ animationDuration: '9s' }}
        />
        {children}
      </div>
    </div>
  )
}
