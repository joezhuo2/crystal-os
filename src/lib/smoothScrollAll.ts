import { smoothScroll } from "@/components/crystal/smoothScroll";

const SKIP = ".xterm, .portal-host";

let installed = false;

export function installSmoothScroll() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  const attached = new WeakMap<Element, () => void>();

  document.addEventListener(
    "wheel",
    (event) => {
      const from = event.target instanceof Element ? event.target : null;
      if (!from || from.closest(SKIP)) return;
      for (let el: Element | null = from; el; el = el.parentElement) {
        const scrolls = el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY);
        const detach = attached.get(el);
        if (!scrolls) {
          detach?.();
          attached.delete(el);
          continue;
        }
        if (!detach && el instanceof HTMLElement) attached.set(el, smoothScroll({ target: el }));
        return;
      }
    },
    { capture: true, passive: true },
  );

  smoothScroll();
}
