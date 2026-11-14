const SLOPE = 2.5066

function gradients(rgba: ArrayLike<number>, w: number, h: number) {
  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  const alpha = (x: number, y: number) => rgba[(y * w + x) * 4 + 3] / 255

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(y - 1, 0)
    const y1 = Math.min(y + 1, h - 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(x - 1, 0)
      const x1 = Math.min(x + 1, w - 1)
      const i = y * w + x
      if (x1 > x0) gx[i] = ((alpha(x1, y) - alpha(x0, y)) * 2) / (x1 - x0)
      if (y1 > y0) gy[i] = ((alpha(x, y1) - alpha(x, y0)) * 2) / (y1 - y0)
    }
  }
  return { gx, gy }
}

export function encodeMap(soft: ArrayLike<number>, w: number, h: number, sigma: number) {
  const map = new Uint8ClampedArray(w * h * 4)
  const { gx, gy } = gradients(soft, w, h)
  const gain = (sigma * SLOPE) / 2

  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    map[o] = 128 + 127 * gx[i] * gain
    map[o + 1] = 128 + 127 * gy[i] * gain
    map[o + 2] = 128
    map[o + 3] = 255
  }
  return map
}

export function encodeRim(sharp: ArrayLike<number>, w: number, h: number, sigma: number) {
  const rim = new Uint8ClampedArray(w * h * 4)
  const { gx, gy } = gradients(sharp, w, h)
  const gain = (sigma * SLOPE) / 2

  for (let i = 0; i < w * h; i++) {
    const length = Math.hypot(gx[i], gy[i])
    if (!length) continue
    const o = i * 4
    const lit = 0.25 + 0.75 * Math.abs((gx[i] + gy[i]) / length) * Math.SQRT1_2
    rim[o] = rim[o + 1] = rim[o + 2] = 255
    rim[o + 3] = 255 * Math.min(1, length * gain) * lit
  }
  return rim
}
