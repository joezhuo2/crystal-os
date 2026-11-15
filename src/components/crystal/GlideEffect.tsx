import { useLayoutEffect, useRef, type ComponentPropsWithoutRef, type ElementType } from 'react'
import { edges, forward, same, type Box } from './glide'
import styles from './GlideEffect.module.css'

type OwnProps = {
  active?: number
  orientation?: 'horizontal' | 'vertical'
  itemSelector?: string
  indicatorClassName?: string
}

export type GlideEffectProps<T extends ElementType = 'div'> = OwnProps & { as?: T } & Omit<
    ComponentPropsWithoutRef<T>,
    keyof OwnProps | 'as'
  >

const flagged = (el: Element, name: string) => el.hasAttribute(name) && el.getAttribute(name) !== 'false'

const isCurrent = (el: Element) =>
  el.getAttribute('aria-selected') === 'true' || flagged(el, 'aria-current') || flagged(el, 'data-active')

export function GlideEffect<T extends ElementType = 'div'>({
  as,
  active,
  orientation = 'horizontal',
  itemSelector,
  indicatorClassName,
  className,
  children,
  ...rest
}: GlideEffectProps<T>) {
  const Tag: ElementType = as ?? 'div'
  const root = useRef<HTMLElement>(null)
  const indicator = useRef<HTMLSpanElement>(null)
  const last = useRef<Box>(undefined)
  const vertical = orientation === 'vertical'

  useLayoutEffect(() => {
    const el = root.current!
    const bar = indicator.current!
    const items = () =>
      itemSelector ? [...el.querySelectorAll(itemSelector)] : [...el.children].filter((child) => child !== bar)

    const measure = () => {
      const list = items()
      const target = active === undefined ? list.find(isCurrent) : list[active]
      if (!target) return bar.removeAttribute('data-show')
      const next = edges(target.getBoundingClientRect(), el.getBoundingClientRect(), el)
      bar.setAttribute('data-show', '')
      if (same(last.current, next)) return
      bar.dataset.forward = String(forward(last.current, next, vertical))
      bar.style.inset = `${next.top}px ${next.right}px ${next.bottom}px ${next.left}px`
      last.current = next
      if (bar.hasAttribute('data-ready')) return
      bar.getBoundingClientRect()
      bar.setAttribute('data-ready', '')
    }

    const resize = new ResizeObserver(measure)
    const observe = () => {
      resize.disconnect()
      resize.observe(el)
      items().forEach((item) => resize.observe(item))
    }
    const mutation = new MutationObserver(() => {
      observe()
      measure()
    })
    mutation.observe(el, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'aria-current', 'data-active'],
    })
    observe()
    measure()
    return () => {
      resize.disconnect()
      mutation.disconnect()
    }
  }, [active, vertical, itemSelector])

  return (
    <Tag ref={root} className={[styles.root, className].filter(Boolean).join(' ')} {...rest}>
      {children}
      <span
        ref={indicator}
        aria-hidden="true"
        data-axis={vertical ? 'y' : 'x'}
        className={[styles.indicator, indicatorClassName].filter(Boolean).join(' ')}
      />
    </Tag>
  )
}
