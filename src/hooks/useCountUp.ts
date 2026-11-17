import { useState, useEffect, useRef } from 'react'

export function useCountUp(end: number, duration = 800) {
  const [value, setValue] = useState(end)
  const raf = useRef(0)
  // The server renders the real number, so the first client pass must not
  // snap it back to 0 (that reads as a glitch). Only later changes animate.
  const previous = useRef(end)

  useEffect(() => {
    // The server renders the real number; only later changes animate. The
    // first frame of the animation writes 0, so nothing is set synchronously
    // in the effect body.
    if (previous.current === end) return
    previous.current = end
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
