import { themeSettings } from "@/lib/themeSettings";

export function installCardGlow() {
  let raf = 0;
  let event: PointerEvent | null = null;

  const apply = () => {
    raf = 0;
    const target = event?.target;
    if (!event || !(target instanceof Element) || themeSettings.getState().theme !== "default") return;
    const card = target.closest<HTMLElement>(".glass-card, .glass-card-hover");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--y", `${event.clientY - rect.top}px`);
  };

  document.addEventListener(
    "pointermove",
    (e) => {
      event = e;
      if (!raf) raf = requestAnimationFrame(apply);
    },
    { passive: true },
  );
}
