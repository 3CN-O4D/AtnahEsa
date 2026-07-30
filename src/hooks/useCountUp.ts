import { useState, useEffect } from 'react'

export function useCountUp(end: number, duration = 800) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (end === 0) { setValue(0); return }

    const startTime = performance.now()
    let frame: number
    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      setValue(Math.floor(progress * end))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [end, duration])

  return value
}
