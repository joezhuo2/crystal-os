export type IconEffectName =
  | "ring"
  | "shake"
  | "turn"
  | "spin"
  | "spinBack"
  | "send"
  | "right"
  | "left"
  | "up"
  | "down"
  | "pop"
  | "bounce"
  | "blink"
  | "tap";

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

const nudge = (x: number, y: number): [Keyframe[], number] => [
  [{ translate: "0 0" }, { translate: `${x}px ${y}px`, offset: 0.4 }, { translate: "0 0" }],
  300,
];

const EFFECTS: Record<IconEffectName, [Keyframe[], number, string?]> = {
  ring: [[0, 16, -14, 10, -6, 3, 0].map((d) => ({ rotate: `${d}deg`, transformOrigin: "50% 12%" })), 600],
  shake: [[0, -2, 2, -1.5, 1, 0].map((x) => ({ translate: `${x}px 0`, rotate: `${x * 4}deg` })), 400],
  turn: [[{ rotate: "0deg" }, { rotate: "90deg" }], 360, SPRING],
  spin: [[{ rotate: "0deg" }, { rotate: "360deg" }], 560, "cubic-bezier(0.4, 0, 0.2, 1)"],
  spinBack: [[{ rotate: "0deg" }, { rotate: "-360deg" }], 560, "cubic-bezier(0.4, 0, 0.2, 1)"],
  send: nudge(3, -3),
  right: nudge(3, 0),
  left: nudge(-3, 0),
  up: nudge(0, -3),
  down: nudge(0, 3),
  pop: [[{ scale: "1" }, { scale: "1.3", offset: 0.4 }, { scale: "0.92", offset: 0.7 }, { scale: "1" }], 380],
  bounce: [
    [
      { translate: "0 0", scale: "1" },
      { translate: "0 -3px", scale: "1.15", offset: 0.35 },
      { translate: "0 0.5px", scale: "0.95", offset: 0.7 },
      { translate: "0 0", scale: "1" },
    ],
    420,
  ],
  blink: [[{ scale: "1 1" }, { scale: "1 0.15", offset: 0.45 }, { scale: "1 1" }], 260],
  tap: [[{ scale: "1" }, { scale: "1.18", offset: 0.4 }, { scale: "1" }], 260],
};

const RULES: [RegExp, IconEffectName | "direction" | null][] = [
  [/^(loader|grip)/, null],
  [/bell|alarm/, "ring"],
  [/^(trash|eraser|ban$)/, "shake"],
  [/^((circle|square)-)?(plus|x)$/, "turn"],
  [/^(rotate-ccw|refresh-ccw|history)/, "spinBack"],
  [/^(refresh|rotate-cw|repeat|orbit|settings|cog)/, "spin"],
  [/^send/, "send"],
  [/^(star|heart|sparkle|gem|smile|thumbs|award|trophy|flame|zap|pin)/, "pop"],
  [/^(download|arrow-down-to)/, "down"],
  [/^upload/, "up"],
  [/^(log-out|external-link|forward|redo)/, "right"],
  [/^(undo|reply)/, "left"],
  [/^.*(?:^|-)(up|down|left|right)(?:-|$)/, "direction"],
  [/check|^(save|clipboard|copy|bookmark|notebook|sticky-note|book|archive|file-plus|folder-plus|image-plus|pen|pencil|square-pen|message-square-plus)/, "bounce"],
  [/^eye/, "blink"],
];

export function iconEffectName(icon: string): IconEffectName | null {
  for (const [pattern, effect] of RULES) {
    const match = pattern.exec(icon);
    if (match) return effect === "direction" ? (match[1] as IconEffectName) : effect;
  }
  return "tap";
}

export const pressScale = (width: number, height: number) => Math.max(0.95, 1 - 6 / Math.max(width, height, 1));

const SELF_EXCLUDE = '[role="switch"], [role="slider"], [role="tab"], [draggable="true"], [aria-roledescription]';
const AREA_EXCLUDE = "nav, .sidebar-shell, .terminal-tab, .portal-pill, .portal-host, .xterm";

let installed = false;

export function installButtonFx() {
  if (installed || typeof document === "undefined") return;
  installed = true;

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  const target = (e: Event) => {
    const btn = (e.target as Element | null)?.closest?.("button");
    if (!btn || btn.disabled || btn.matches(SELF_EXCLUDE) || btn.closest(AREA_EXCLUDE)) return null;
    if (reducedMotion?.matches || document.documentElement.classList.contains("perf-still")) return null;
    return btn;
  };

  let pressed: { el: HTMLButtonElement; scale: number; anim: Animation } | null = null;
  const release = () => {
    if (!pressed) return;
    const { el, scale, anim } = pressed;
    pressed = null;
    anim.cancel();
    el.animate([{ scale: String(scale) }, { scale: "1" }], { duration: 320, easing: SPRING });
  };

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      release();
      const el = target(e);
      if (!el) return;
      const scale = pressScale(el.offsetWidth, el.offsetHeight);
      const anim = el.animate([{ scale: "1" }, { scale: String(scale) }], { duration: 90, easing: "ease-out", fill: "forwards" });
      pressed = { el, scale, anim };
    },
    true,
  );
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
  window.addEventListener("blur", release);

  document.addEventListener(
    "click",
    (e) => {
      const btn = target(e);
      if (!btn) return;
      // A frame later, so an icon React swaps on click (play/pause, save/check) animates in its new form.
      requestAnimationFrame(() => {
        const svg = btn.isConnected ? btn.querySelector("svg.lucide") : null;
        if (!svg || svg.matches('.animate-spin, [class*="-spin"]')) return;
        const icon = [...svg.classList].find((c) => c.startsWith("lucide-"))?.slice(7);
        const effect = icon ? iconEffectName(icon) : null;
        if (!effect) return;
        const [keyframes, duration, easing = "ease-out"] = EFFECTS[effect];
        svg.animate(keyframes, { duration, easing });
      });
    },
    true,
  );
}
