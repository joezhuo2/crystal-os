import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
} from 'react'
import { useSpotlight } from './useSpotlight'
import styles from './GlassSurface.module.css'
import { encodeMap, encodeRim } from './maps'

type OwnProps = {
  radius?: number
  mask?: string
  strength?: number
  bezel?: number
  spotlight?: boolean | string
  children?: ReactNode
}

export type GlassSurfaceProps<T extends ElementType = 'div'> = OwnProps & { as?: T } & Omit<
    ComponentPropsWithoutRef<T>,
    keyof OwnProps | 'as'
  >

type Maps = { w: number; h: number; map: string; rim?: string }

export function GlassSurface<T extends ElementType = 'div'>({
  as,
  radius = 12,
  mask,
  strength = 30,
  bezel = 20,
  spotlight,
  className,
  style,
  children,
  ...rest
}: GlassSurfaceProps<T>) {
  const Tag: ElementType = as ?? 'div'
  const ref = useRef<HTMLElement>(null)
  const id = `cg-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [maps, setMaps] = useState<Maps>()
  useSpotlight(ref, !!spotlight)

  useEffect(() => {
    const el = ref.current
    if (!el || !/Chrome\//.test(navigator.userAgent)) return

    let image: HTMLImageElement | undefined
    const render = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (!w || !h) return
      const layer = (scale: number, sigma: number, encode: typeof encodeMap) => {
        const cw = Math.round(w * scale)
        const ch = Math.round(h * scale)
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.filter = `blur(${sigma * scale}px)`
        if (image) {
          const fit = Math.min(cw / image.naturalWidth, ch / image.naturalHeight)
          const iw = image.naturalWidth * fit
          const ih = image.naturalHeight * fit
          ctx.drawImage(image, (cw - iw) / 2, (ch - ih) / 2, iw, ih)
        } else {
          ctx.beginPath()
          ctx.roundRect(0, 0, cw, ch, Math.min(radius, w / 2, h / 2) * scale)
          ctx.fill()
        }
        const pixels = encode(ctx.getImageData(0, 0, cw, ch).data, cw, ch, sigma * scale)
        ctx.putImageData(new ImageData(pixels, cw, ch), 0, 0)
        return canvas.toDataURL()
      }
      try {
        const map = layer(1, bezel / 2, encodeMap)
        const rim = image && layer(Math.min(window.devicePixelRatio || 1, 2), 0.75, encodeRim)
        setMaps({ w, h, map, rim })
      } catch {
        setMaps(undefined)
      }
    }

    const observer = new ResizeObserver(render)
    if (mask) {
      image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => observer.observe(el)
      image.src = mask
    } else {
      observer.observe(el)
    }
    return () => observer.disconnect()
  }, [mask, radius, bezel])

  const shape = mask ? `url("${mask}") center / contain no-repeat` : undefined
  const refraction = maps && `url(#${id}) blur(var(--cg-blur, 2px)) saturate(1.4)`

  return (
    <Tag
      {...rest}
      ref={ref}
      className={[styles.glass, spotlight && styles.spot, className].filter(Boolean).join(' ')}
      style={{
        borderRadius: mask ? undefined : radius,
        ...(typeof spotlight === 'string' && { '--cd-spot': spotlight }),
        mask: shape,
        WebkitMask: shape,
        ...(refraction && { backdropFilter: refraction }),
        ...style,
      }}
    >
      {maps && (
        <>
          <svg className={styles.defs} aria-hidden="true">
            <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
              <feImage
                href={maps.map}
                x="0"
                y="0"
                width={maps.w}
                height={maps.h}
                preserveAspectRatio="none"
                result="map"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="map"
                scale={strength}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </svg>
          {maps.rim && (
            <span className={styles.rim} style={{ backgroundImage: `url(${maps.rim})` }} aria-hidden="true" />
          )}
        </>
      )}
      {children}
    </Tag>
  )
}
