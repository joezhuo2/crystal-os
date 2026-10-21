export function stepTab<T>(order: readonly T[], current: T, delta: 1 | -1): T {
  const i = order.indexOf(current);
  if (i < 0) return order[0];
  return order[(i + delta + order.length) % order.length];
}
