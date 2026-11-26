const GLASS = ".glass-card, .glass-card-hover";

export function markFadeUnits(root: Element) {
  const glass = root.querySelectorAll(GLASS);
  const holders = new Set<Element>([root]);
  for (const card of glass) {
    for (let p = card.parentElement; p && !holders.has(p); p = p.parentElement) holders.add(p);
  }
  const units = new Set<Element>(glass);
  for (const holder of holders) {
    for (const child of holder.children) if (!holders.has(child)) units.add(child);
  }
  for (const el of root.querySelectorAll("[data-view-fade]")) if (!units.has(el)) el.removeAttribute("data-view-fade");
  for (const el of units) if (!el.hasAttribute("data-view-fade")) el.setAttribute("data-view-fade", "");
}
