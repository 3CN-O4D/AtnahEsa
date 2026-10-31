'use client'

import { useEffect, useState } from 'react'

/**
 * Re-triggers a shake animation whenever `signal` increments. The signal is
 * tracked in state so a new error can restart the animation and the timer can
 * be reset cleanly, without a mount-time flicker.
 */
export function useShake(signal: number) {
  const [state, setState] = useState({ signal, shaking: false })

  if (signal !== state.signal) {
    setState({ signal, shaking: signal > 0 })
  }

  useEffect(() => {
    if (!state.shaking) return
    const timer = window.setTimeout(() => {
      setState((prev) => ({ ...prev, shaking: false }))
    }, 620)
    return () => window.clearTimeout(timer)
  }, [state.shaking, state.signal])

  return state.shaking
}
