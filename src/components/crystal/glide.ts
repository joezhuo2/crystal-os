export type Box = { left: number; top: number; right: number; bottom: number }

export type Frame = {
  offsetWidth: number
  clientLeft: number
  clientTop: number
  clientWidth: number
  clientHeight: number
  scrollLeft: number
  scrollTop: number
}

export function edges(item: Box, rect: Box, frame: Frame): Box {
  const scale = (rect.right - rect.left) / frame.offsetWidth || 1
  const x = (v: number) => (v - rect.left) / scale - frame.clientLeft + frame.scrollLeft
  const y = (v: number) => (v - rect.top) / scale - frame.clientTop + frame.scrollTop
  return {
    left: x(item.left),
    top: y(item.top),
    right: frame.clientWidth - x(item.right),
    bottom: frame.clientHeight - y(item.bottom),
  }
}

export const forward = (prev: Box | undefined, next: Box, vertical: boolean) =>
  !prev ||
  (vertical ? next.top > prev.top || next.bottom < prev.bottom : next.left > prev.left || next.right < prev.right)

export const same = (a: Box | undefined, b: Box) =>
  !!a && a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
