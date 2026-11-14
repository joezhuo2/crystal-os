import { useEffect, type RefObject } from 'react'

export function useSpotlight(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let frame = 0
    let x = 0
    let y = 0
    const paint = () => {
      frame = 0
      const box = el.getBoundingClientRect()
      el.style.setProperty('--cd-mx', `${x - box.left}px`)
      el.style.setProperty('--cd-my', `${y - box.top}px`)
    }
    const move = (e: PointerEvent) => {
      x = e.clientX
      y = e.clientY
      el.style.setProperty('--cd-lit', '1')
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const leave = () => el.style.setProperty('--cd-lit', '0')
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerleave', leave)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerleave', leave)
      el.style.removeProperty('--cd-mx')
      el.style.removeProperty('--cd-my')
      el.style.removeProperty('--cd-lit')
    }
  }, [ref, enabled])
}
