import { useState, useEffect, useRef } from 'react'

export function useCountUp(end: number, duration = 800) {
  const [value, setValue] = useState(end)
  const raf = useRef(0)

  useEffect(() => {
    if (end === 0) return
    setValue(0)
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      setValue(Math.floor(p * end))
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [end, duration])

  return value
}
