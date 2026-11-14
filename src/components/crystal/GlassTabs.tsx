import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { GlassSurface, type GlassSurfaceProps } from './GlassSurface'
import styles from './GlassTabs.module.css'

export type GlassTabItem = string | { value: string; label: ReactNode }

export type GlassTabsProps = Omit<GlassSurfaceProps<'div'>, 'as' | 'onChange'> & {
  items: GlassTabItem[]
  value: string
  onChange: (value: string) => void
}

type Span = { left: number; right: number }

export function GlassTabs({ items, value, onChange, radius = 14, className, ...rest }: GlassTabsProps) {
  const track = useRef<HTMLDivElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const [span, setSpan] = useState<Span>()
  const [forward, setForward] = useState(true)
  const options = items.map((item) => (typeof item === 'string' ? { value: item, label: item } : item))
  const index = Math.max(0, options.findIndex((option) => option.value === value))

  useLayoutEffect(() => {
    const measure = () => {
      const tab = tabs.current[index]
      const el = track.current
      if (!tab || !el) return
      const next = { left: tab.offsetLeft, right: el.clientWidth - tab.offsetLeft - tab.offsetWidth }
      setSpan((prev) => {
        if (prev && prev.left === next.left && prev.right === next.right) return prev
        if (prev) setForward(next.left > prev.left || next.right < prev.right)
        return next
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track.current!)
    tabs.current.forEach((tab) => tab && observer.observe(tab))
    return () => observer.disconnect()
  }, [index, options.length])

  const onKeyDown = (event: KeyboardEvent) => {
    const last = options.length - 1
    const target = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    }[event.key]
    if (target === undefined) return
    event.preventDefault()
    onChange(options[target].value)
    tabs.current[target]?.focus()
  }

  return (
    <GlassSurface
      radius={radius}
      role="tablist"
      className={[styles.track, className].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
      {...rest}
    >
      <span
        ref={track}
        className={styles.holder}
        aria-hidden="true"
      >
        {span && (
          <span
            className={styles.thumb}
            data-forward={forward}
            style={{ left: span.left, right: span.right, borderRadius: Math.max(0, radius - 4) }}
          />
        )}
      </span>
      {options.map((option, i) => (
        <button
          key={option.value}
          ref={(el) => {
            tabs.current[i] = el
          }}
          type="button"
          role="tab"
          aria-selected={i === index}
          tabIndex={i === index ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </GlassSurface>
  )
}
