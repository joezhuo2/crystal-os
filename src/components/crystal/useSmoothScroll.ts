import { useEffect, type RefObject } from 'react'
import { smoothScroll } from './smoothScroll'

export function useSmoothScroll(ref?: RefObject<HTMLElement | null>, ease?: number) {
  useEffect(() => smoothScroll({ ease, target: ref?.current ?? undefined }), [ref, ease])
}
